from __future__ import annotations

import argparse
import json
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GOLDEN_DIR = (
    ROOT.parent
    / "2. Vibe Formulation Extraction"
    / "2. Extracted Outputs"
    / "Commercial Extracted Output w Position"
)
INPUT_DIR = ROOT / "Input text"
ANNOTATION_DIR = ROOT / "annotations"
AUDIT_PATH = ROOT / "annotation_import_audit.json"

ENTITY_FIELDS = {
    "components": ("node_no", "component_name", "concentration", "unit", "evidence_spans"),
    "formulations": ("node_no", "formulation_ref", "combo", "evidence_spans"),
    "performances": (
        "node_no",
        "performance_metric",
        "formulation",
        "quantitative_value_map",
        "units_map",
        "qualitative_value_map",
        "operating_conditions",
        "evidence_spans",
    ),
}

EVIDENCE_ALIASES = {
    "Comparative example 1": "example 1",
    "Comparative example 2": "example 2",
    "Comparative example 3": "example 3",
    "Comparative example 4": "example 4",
    "Comparative example 5": "example 5",
    "4.3 V discharge capacity, mAh/g": "capacity, mAh/g",
    "DSC (° C.) before coating": "DSC",
    "DSC (° C.) after coating": "DSC",
    "Whether or not reaction product is present at 300° C.": "is present at 300° C.",
    "QD (green-light-emitting)": "green-light-emitting nanocrystal particles",
    "Ethylene glycol diglycidyl ether": "diglycidyl ether",
}

CONTEXTUAL_ALIASES = {
    "Example 1": ("TABLE IExample1234*", "1"),
    "Example 2": ("TABLE IExample1234*", "2"),
    "Example 3": ("TABLE IExample1234*", "3"),
    "Example 4*": ("TABLE IExample1234*", "4*"),
    "No bubbles": ("Evaluation of bubblesNoNoFormationbubblesbubblesof bubbles", "No"),
    "Formation of bubbles": ("Evaluation of bubblesNoNoFormationbubblesbubblesof bubbles", "Formation"),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import golden extraction records into local annotation drafts.")
    parser.add_argument("--golden-dir", type=Path, default=DEFAULT_GOLDEN_DIR)
    parser.add_argument("--dry-run", action="store_true", help="Audit offsets without writing annotation drafts.")
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def all_occurrences(text: str, needle: str) -> list[tuple[int, int]]:
    if not needle:
        return []
    matches = [(match.start(), match.end()) for match in re.finditer(re.escape(needle), text)]
    if matches:
        return matches
    matches = [(match.start(), match.end()) for match in re.finditer(re.escape(needle), text, re.IGNORECASE)]
    if matches:
        return matches
    flexible = "".join(
        r"\s+" if character.isspace()
        else r"[-‐‑‒–—−]" if character in "-‐‑‒–—−"
        else re.escape(character)
        for character in needle
    )
    return [(match.start(), match.end()) for match in re.finditer(flexible, text, re.IGNORECASE)]


def expand_composite_spans(evidence_spans: list[dict[str, Any]]) -> list[dict[str, Any]]:
    expanded = []
    for span in evidence_spans:
        text = str(span.get("text", "")).strip()
        splitter = r"\s*(?:\.{3}|…|;)\s*"
        if span.get("field") == "concentration":
            splitter = r"\s*(?:\.{3}|…|;|\bto\b)\s*"
        pieces = [piece.strip() for piece in re.split(splitter, text) if piece.strip()]
        if len(pieces) == 1:
            expanded.append(span)
            continue
        expanded.extend({"field": span.get("field", ""), "text": piece} for piece in pieces)
    return expanded


def contextual_occurrence(markdown: str, text: str) -> list[tuple[int, int]]:
    if text not in CONTEXTUAL_ALIASES:
        return []
    context, token = CONTEXTUAL_ALIASES[text]
    context_start = markdown.find(context)
    if context_start < 0:
        return []
    token_start = context.find(token)
    start = context_start + token_start
    return [(start, start + len(token))]


def span_distance(candidate: tuple[int, int], selected: list[tuple[int, int]]) -> int:
    if not selected:
        return 0
    center = (candidate[0] + candidate[1]) // 2
    return min(abs(center - ((start + end) // 2)) for start, end in selected)


def locate_evidence(
    markdown: str,
    evidence_spans: list[dict[str, Any]],
    used: set[tuple[int, int, str]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    evidence_spans = expand_composite_spans(evidence_spans)
    candidates_by_index = {
        index: all_occurrences(markdown, str(span.get("text", "")))
        for index, span in enumerate(evidence_spans)
    }
    order = sorted(candidates_by_index, key=lambda index: (len(candidates_by_index[index]) or 10**9, index))
    selected: dict[int, tuple[int, int]] = {}
    selected_ranges: list[tuple[int, int]] = []
    unresolved: list[dict[str, Any]] = []

    for index in order:
        span = evidence_spans[index]
        text = str(span.get("text", ""))
        candidates = candidates_by_index[index]
        if not candidates:
            candidates = contextual_occurrence(markdown, text)
        if not candidates and text in EVIDENCE_ALIASES:
            text = EVIDENCE_ALIASES[text]
            candidates = all_occurrences(markdown, text)
        if not candidates:
            unresolved.append({"field": span.get("field", ""), "text": text, "reason": "text not found"})
            continue
        best = min(
            candidates,
            key=lambda candidate: (
                (candidate[0], candidate[1], text) in used,
                span_distance(candidate, selected_ranges),
                candidate[0],
            ),
        )
        selected[index] = best
        selected_ranges.append(best)
        used.add((best[0], best[1], text))

    located = []
    for index, span in enumerate(evidence_spans):
        if index not in selected:
            continue
        start, end = selected[index]
        source_text = markdown[start:end]
        located.append({"field": str(span.get("field", "")), "text": source_text, "start": start, "end": end})
    return located, unresolved


def convert_record(
    markdown: str,
    entity_type: str,
    source: dict[str, Any],
    used: set[tuple[int, int, str]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    record = {field: source.get(field) for field in ENTITY_FIELDS[entity_type] if field != "evidence_spans"}
    evidence_spans = [
        span for span in source.get("evidence_spans", [])
        if not (entity_type == "formulations" and span.get("field") == "combo")
    ]
    record["evidence_spans"], unresolved = locate_evidence(markdown, evidence_spans, used)
    return record, unresolved


def default_state(document_id: str, patent_id: str) -> dict[str, Any]:
    return {
        "document_id": document_id,
        "patent_id": patent_id,
        "status": "Completed",
        "components": [],
        "formulations": [],
        "performances": [],
    }


def back_up_annotations() -> Path | None:
    existing = list(ANNOTATION_DIR.glob("*.annotation.json"))
    if not existing:
        return None
    backup_dir = ROOT / "annotation_backups" / datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir.mkdir(parents=True)
    for path in existing:
        shutil.copy2(path, backup_dir / path.name)
    return backup_dir


def main() -> None:
    args = parse_args()
    golden_dir = args.golden_dir.resolve()
    documents = {}
    for path in INPUT_DIR.glob("*.txt"):
        payload = load_json(path)
        documents[str(payload.get("patent_id", "")).strip()] = (path, payload)

    ANNOTATION_DIR.mkdir(exist_ok=True)
    backup_dir = None if args.dry_run else back_up_annotations()
    audit: dict[str, Any] = {
        "golden_dir": str(golden_dir),
        "backup_dir": str(backup_dir) if backup_dir else None,
        "documents": [],
    }

    for golden_path in sorted(golden_dir.glob("*.txt"), key=lambda path: int(path.name.split(".")[0])):
        golden = load_json(golden_path)
        source_id = str(golden.get("meta", {}).get("source_id", "")).strip()
        if source_id not in documents:
            audit["documents"].append({"golden_file": golden_path.name, "source_id": source_id, "error": "source document not found"})
            continue
        input_path, input_payload = documents[source_id]
        markdown = str(input_payload.get("markdown", ""))
        state = default_state(input_path.name, str(input_payload.get("patent_id", "")))
        used: set[tuple[int, int, str]] = set()
        unresolved = []
        for entity_type in ENTITY_FIELDS:
            for source_record in golden.get(entity_type, []):
                record, record_unresolved = convert_record(markdown, entity_type, source_record, used)
                state[entity_type].append(record)
                for item in record_unresolved:
                    unresolved.append({"entity_type": entity_type, "node_no": source_record.get("node_no"), **item})

        output_path = ANNOTATION_DIR / f"{input_path.stem}.annotation.json"
        if not args.dry_run:
            output_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        audit["documents"].append(
            {
                "golden_file": golden_path.name,
                "document_id": input_path.name,
                "output_file": output_path.name,
                "counts": {entity_type: len(state[entity_type]) for entity_type in ENTITY_FIELDS},
                "located_spans": sum(
                    len(record["evidence_spans"])
                    for entity_type in ENTITY_FIELDS
                    for record in state[entity_type]
                ),
                "unresolved_spans": unresolved,
            }
        )

    AUDIT_PATH.write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
    unresolved_count = sum(len(item.get("unresolved_spans", [])) for item in audit["documents"])
    print(f"Audited {len(audit['documents'])} golden files; unresolved spans: {unresolved_count}")
    if not args.dry_run:
        print(f"Wrote annotation drafts to {ANNOTATION_DIR}")
    print(f"Audit report: {AUDIT_PATH}")


if __name__ == "__main__":
    main()
