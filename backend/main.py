from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import tempfile
from base64 import b64decode
from html import unescape
from pathlib import Path
from threading import Lock
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ValidationError

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIST = ROOT / "frontend" / "dist"
SETTINGS_PATH = ROOT / ".annotation_platform.json"
TEXT_EXTENSIONS = {".md", ".markdown", ".txt", ".json"}
CONFIGURED_WORKSPACE = os.getenv("ANNOTATION_WORKSPACE_PATH", "").strip()
SEED_WORKSPACE = os.getenv("ANNOTATION_SEED_WORKSPACE", "").strip().lower() in {"1", "true", "yes", "on"}
APP_USERNAME = os.getenv("ANNOTATION_APP_USERNAME", "annotator")
APP_PASSWORD = os.getenv("ANNOTATION_APP_PASSWORD", "")

Status = Literal["Unannotated", "Partially complete", "Completed"]
SourceType = Literal["patent", "paper"]
SubstanceType = Literal["canonical", "commercial", "formula", "raw"]
ConstituentStatus = Literal["included", "excluded", "optional", "-"]
AmountComparator = Literal["=", ">", "<", ">=", "<=", "approx", "range", "balance", "-"]
KeyConstituent = Literal["yes", "no", "-"]
PropertyType = Literal["intrinsic", "extrinsic", "performance"]
MeasurementType = Literal["quantitative", "qualitative"]
Comparator = Literal["=", ">", "<", ">=", "<=", "approx", "range", "-"]
ENTITY_ORDER = ("substances", "compositions", "properties", "measurements")
IDENTITY_FIELDS = {
    "substances": "substance_name",
    "compositions": "composition_name",
    "properties": "property_name",
    "measurements": "value",
}


class EvidenceSpan(BaseModel):
    field: str = "evidence_text"
    text: str
    start: int | None = None
    end: int | None = None
    primary: bool = False


class Meta(BaseModel):
    source_type: SourceType = "patent"
    source_id: str = "-"


class SubstanceRecord(BaseModel):
    node_no: int
    substance_name: str = "-"
    substance_type: SubstanceType = "raw"
    physical_form: str = "-"
    manufacturer: str = "-"
    evidence_text: str = "-"
    evidence_spans: list[EvidenceSpan] = Field(default_factory=list)


class ConstituentRecord(BaseModel):
    constituent_ref: int
    constituent_status: ConstituentStatus = "included"
    amount_comparator: AmountComparator = "-"
    amount_value: str | float = "-"
    amount_unit: str = "-"
    amount_lower_value: str | float = "-"
    amount_upper_value: str | float = "-"
    function: str = "-"
    key_constituent: KeyConstituent = "-"
    key_reason: str = "-"


class CompositionRecord(BaseModel):
    node_no: int
    composition_name: str = "-"
    composition_type: str = "-"
    physical_form: str = "-"
    constituents: list[ConstituentRecord] = Field(default_factory=list)
    evidence_text: str = "-"
    evidence_spans: list[EvidenceSpan] = Field(default_factory=list)


class PropertyRecord(BaseModel):
    node_no: int
    property_name: str = "-"
    property_type: PropertyType = "performance"
    target_ref: int = 0
    evidence_text: str = "-"
    evidence_spans: list[EvidenceSpan] = Field(default_factory=list)


class MeasurementCondition(BaseModel):
    condition_name: str = "-"
    condition_value: list[str | float] = Field(default_factory=list)
    condition_unit: list[str] = Field(default_factory=list)


class MeasurementRecord(BaseModel):
    node_no: int
    measurement_type: MeasurementType = "quantitative"
    property_ref: int = 0
    value: list[str | float] = Field(default_factory=list)
    comparator: Comparator = "-"
    unit: list[str] = Field(default_factory=list)
    lower_value: str | float = "-"
    upper_value: str | float = "-"
    measurement_conditions: list[MeasurementCondition] = Field(default_factory=list)
    evidence_text: str = "-"
    evidence_spans: list[EvidenceSpan] = Field(default_factory=list)


class GraphPosition(BaseModel):
    x: float
    y: float


class AnnotationState(BaseModel):
    document_id: str
    patent_id: str = ""
    status: Status = "Unannotated"
    meta: Meta = Field(default_factory=Meta)
    substances: list[SubstanceRecord] = Field(default_factory=list)
    compositions: list[CompositionRecord] = Field(default_factory=list)
    properties: list[PropertyRecord] = Field(default_factory=list)
    measurements: list[MeasurementRecord] = Field(default_factory=list)
    graph_layout: dict[str, GraphPosition] = Field(default_factory=dict)


class OpenWorkspaceRequest(BaseModel):
    path: str


class WorkspacePayload(BaseModel):
    path: str | None = None
    parent_path: str | None = None
    files: list[dict] = Field(default_factory=list)


class DocumentPayload(BaseModel):
    document_id: str
    patent_id: str
    markdown: str
    state: AnnotationState
    annotation_path: str | None = None
    revision: str = "0"


app = FastAPI(title="Local Patent Annotation Workbench")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_lock = Lock()
_workspace_path: Path | None = None
_seeded_workspaces: set[str] = set()


def authentication_enabled() -> bool:
    return bool(APP_PASSWORD)


def authenticate_basic_header(header: str | None) -> bool:
    if not authentication_enabled():
        return True
    if not header or not header.startswith("Basic "):
        return False
    try:
        decoded = b64decode(header.removeprefix("Basic ").strip()).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return False
    username, separator, password = decoded.partition(":")
    return bool(separator) and secrets.compare_digest(username, APP_USERNAME) and secrets.compare_digest(password, APP_PASSWORD)


@app.middleware("http")
async def require_basic_auth(request: Request, call_next):
    if request.method == "OPTIONS" or request.url.path == "/api/health" or authenticate_basic_header(request.headers.get("authorization")):
        return await call_next(request)
    return Response(
        "Authentication required",
        status_code=401,
        headers={"WWW-Authenticate": 'Basic realm="Annotation Platform"'},
    )


def configured_workspace() -> Path | None:
    if not CONFIGURED_WORKSPACE:
        return None
    path = Path(CONFIGURED_WORKSPACE).expanduser().resolve()
    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Configured workspace is not writable: {path}") from exc
    if not path.is_dir():
        raise HTTPException(status_code=500, detail=f"Configured workspace is not a folder: {path}")
    seed_workspace(path)
    return path


def seed_workspace(path: Path) -> None:
    if not SEED_WORKSPACE:
        return
    path_key = str(path)
    with _lock:
        if path_key in _seeded_workspaces:
            return
        seed_dir = ROOT / "seed-workspace"
        if seed_dir.is_dir():
            for source in seed_dir.iterdir():
                if not source.is_file():
                    continue
                destination = path / source.name
                if not destination.exists():
                    shutil.copy2(source, destination)
        _seeded_workspaces.add(path_key)


def load_recent_workspace() -> Path | None:
    if not SETTINGS_PATH.exists():
        return None
    try:
        path = Path(json.loads(SETTINGS_PATH.read_text(encoding="utf-8")).get("workspace_path", "")).expanduser()
    except (OSError, json.JSONDecodeError):
        return None
    return path.resolve() if path.is_dir() else None


def save_recent_workspace(path: Path) -> None:
    write_text_atomic(SETTINGS_PATH, json.dumps({"workspace_path": str(path)}, indent=2))


def current_workspace(required: bool = True) -> Path | None:
    global _workspace_path
    configured = configured_workspace()
    if configured:
        return configured
    with _lock:
        if _workspace_path and _workspace_path.is_dir():
            return _workspace_path
        recent = load_recent_workspace()
        if recent:
            _workspace_path = recent
            return recent
    if required:
        raise HTTPException(status_code=400, detail="Open a working folder first")
    return None


def set_workspace(path_text: str) -> Path:
    global _workspace_path
    configured = configured_workspace()
    if configured:
        return configured
    path = Path(path_text.strip().strip('"')).expanduser().resolve()
    if not path.is_dir():
        raise HTTPException(status_code=400, detail=f"Folder does not exist: {path}")
    with _lock:
        _workspace_path = path
    save_recent_workspace(path)
    return path


def write_text_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    temp_path = Path(temp_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        temp_path.replace(path)
    finally:
        if temp_path.exists():
            temp_path.unlink()


def is_annotation_stem(stem: str) -> bool:
    return stem.endswith("_annotated") or stem.endswith("_partially_annotated") or stem.endswith(".annotation") or stem.endswith(".schema")


def raw_stem_from_annotation(path: Path) -> str:
    stem = path.stem
    if stem.endswith("_partially_annotated"):
        return stem[: -len("_partially_annotated")]
    if stem.endswith("_annotated"):
        return stem[: -len("_annotated")]
    return stem


def is_raw_text_file(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in TEXT_EXTENSIONS and not is_annotation_stem(path.stem)


def patent_id_from_name(path: Path) -> str:
    stem = raw_stem_from_annotation(path)
    match = re.match(r"^\s*\d+\.\s*(.+)$", stem)
    return (match.group(1) if match else stem).strip() or "-"


def raw_file_path(file_name: str) -> Path:
    workspace = current_workspace()
    assert workspace is not None
    path = (workspace / file_name).resolve()
    if path.parent != workspace.resolve() or not is_raw_text_file(path):
        raise HTTPException(status_code=404, detail="Raw patent text file not found")
    return path


def annotation_candidates(raw_path: Path) -> list[Path]:
    return [
        raw_path.with_name(f"{raw_path.stem}_annotated.json"),
        raw_path.with_name(f"{raw_path.stem}_partially_annotated.json"),
        raw_path.with_name(f"{raw_path.stem}.annotation.json"),
    ]


def selected_annotation_path(raw_path: Path) -> Path | None:
    existing = [path for path in annotation_candidates(raw_path) if path.exists()]
    if not existing:
        return None
    return max(existing, key=lambda path: path.stat().st_mtime_ns)


def document_revision(raw_path: Path) -> str:
    annotation_path = selected_annotation_path(raw_path)
    return str(annotation_path.stat().st_mtime_ns) if annotation_path else "0"


def save_path_for_status(raw_path: Path, status: Status) -> Path:
    suffix = "_annotated.json" if status == "Completed" else "_partially_annotated.json"
    return raw_path.with_name(f"{raw_path.stem}{suffix}")


def remove_stale_annotation_files(raw_path: Path, keep: Path) -> None:
    for candidate in annotation_candidates(raw_path):
        if candidate == keep:
            continue
        if candidate.exists():
            candidate.unlink()


MOJIBAKE_REPLACEMENTS = {
    "âˆ’": "−",
    "â€“": "–",
    "â€”": "—",
    "â€˜": "‘",
    "â€™": "’",
    "â€œ": "“",
    "â€": "”",
    "â€³": "″",
    "â€²": "′",
    "â‰¤": "≤",
    "â‰¥": "≥",
    "â‰ˆ": "≈",
    "â‰": "≠",
    "Ã—": "×",
    "Â±": "±",
    "Â°": "°",
    "Âµ": "µ",
    "Â·": "·",
    "Â": "",
    "Î±": "α",
    "Î²": "β",
    "Î³": "γ",
    "Î´": "δ",
    "Î”": "Δ",
    "Îµ": "ε",
    "Ï": "ρ",
    "Ï�": "ρ",
    "Ïƒ": "σ",
    "Ï‰": "ω",
    "â€‰": " ",
    "â€ƒ": " ",
    "â€‚": " ",
    "â€¯": " ",
    "\u00a0": " ",
}

PATENT_HEADINGS = {
    "ABSTRACT",
    "BACKGROUND",
    "BACKGROUND OF THE INVENTION",
    "BRIEF DESCRIPTION OF THE DRAWING",
    "BRIEF DESCRIPTION OF THE DRAWINGS",
    "CROSS REFERENCE TO RELATED APPLICATIONS",
    "DETAILED DESCRIPTION",
    "DETAILED DESCRIPTION OF THE INVENTION",
    "DETAILED DESCRIPTION OF THE PREFERRED EMBODIMENTS",
    "FIELD",
    "FIELD OF THE INVENTION",
    "REFERENCE SIGNS LIST",
    "SUMMARY",
    "SUMMARY OF THE INVENTION",
}


def read_text_flexible(path: Path) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    return path.read_text(encoding="utf-8-sig", errors="replace")


def fix_mojibake(text: str) -> str:
    for broken, fixed in MOJIBAKE_REPLACEMENTS.items():
        text = text.replace(broken, fixed)
    return text


def looks_like_html_markup(text: str) -> bool:
    return bool(
        re.search(
            r"</?(?:a|article|b|body|br|div|em|h[1-6]|head|html|i|li|ol|p|script|section|span|style|sub|sup|table|td|th|tr|ul)\b",
            text,
            flags=re.IGNORECASE,
        )
    )


def looks_like_raw_patent_text(text: str, suffix: str) -> bool:
    if looks_like_html_markup(text):
        return True
    if any(token in text for token in MOJIBAKE_REPLACEMENTS):
        return True
    if suffix.lower() == ".txt" and re.search(r"^\s*[A-Z][A-Z0-9 ,/&()'-]{5,}\s*$", text, flags=re.MULTILINE):
        return True
    return False


def htmlish_to_text(text: str) -> str:
    text = re.sub(r"<\s*(?:script|style)\b[^>]*>.*?<\s*/\s*(?:script|style)\s*>", "", text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<\s*br\s*/?\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<\s*/\s*h[1-6]\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<\s*h[1-6]\b[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<\s*/\s*p\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<\s*p\b[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<\s*/\s*(?:ul|ol)\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<\s*(?:ul|ol)\b[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<\s*li\b[^>]*>", "\n- ", text, flags=re.IGNORECASE)
    text = re.sub(r"<\s*/\s*li\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<\s*b\b[^>]*>\s*(\[\d{4,}\])\s*<\s*/\s*b\s*>", r"\n\1 ", text, flags=re.IGNORECASE)
    text = re.sub(r"<\s*(?:div|tr)\b[^>]*(?:uspto-tr|class=['\"]?tr|role=['\"]?row)[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<\s*(?:div|td|th)\b[^>]*(?:uspto-(?:l-)?td|class=['\"]?(?:td|th)|role=['\"]?cell)[^>]*>", "\t", text, flags=re.IGNORECASE)
    text = re.sub(r"<\s*/\s*(?:div|td|th|tr)\s*>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<\s*/?\s*(?:sub|sup)\b[^>]*>", "", text, flags=re.IGNORECASE)
    text = re.sub(
        r"</?(?:a|article|b|body|br|div|em|h[1-6]|head|html|i|li|ol|p|script|section|span|style|sub|sup|table|td|th|tr|ul)\b[^>]*>",
        "",
        text,
        flags=re.IGNORECASE,
    )
    return text


def is_heading_line(line: str) -> bool:
    cleaned = line.strip().strip(":")
    if cleaned in PATENT_HEADINGS:
        return True
    if len(cleaned) < 6 or len(cleaned) > 90:
        return False
    if re.search(r"[.!?;]\s*$", cleaned):
        return False
    letters = re.sub(r"[^A-Za-z]", "", cleaned)
    return len(letters) >= 5 and letters.upper() == letters


def normalize_patent_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"(?<!^)(?<!\n)(\[\d{4,}\])", r"\n\1", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    normalized_lines: list[str] = []
    for raw_line in text.split("\n"):
        line = re.sub(r"[ \t]{2,}", " ", raw_line.strip())
        if not line:
            if normalized_lines and normalized_lines[-1] != "":
                normalized_lines.append("")
            continue
        if "\t" in raw_line:
            cells = [re.sub(r"\s+", " ", cell.strip()) for cell in raw_line.split("\t") if cell.strip()]
            if len(cells) >= 2:
                normalized_lines.append(" | ".join(cells))
                continue
        if line.startswith("- "):
            normalized_lines.append(line)
            continue
        if is_heading_line(line):
            if normalized_lines and normalized_lines[-1] != "":
                normalized_lines.append("")
            normalized_lines.append(f"## {line.title()}")
            normalized_lines.append("")
            continue
        normalized_lines.append(line)

    text = "\n".join(normalized_lines)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + ("\n" if text.strip() else "")


def clean_raw_document_text(text: str, suffix: str) -> str:
    text = fix_mojibake(unescape(text))
    if not looks_like_raw_patent_text(text, suffix):
        return text.replace("\r\n", "\n").replace("\r", "\n")
    if looks_like_html_markup(text):
        text = htmlish_to_text(text)
    text = fix_mojibake(unescape(text))
    return normalize_patent_text(text)


def json_value_to_text(value: object, suffix: str) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        items = [json_value_to_text(item, suffix).strip() for item in value]
        return "\n\n".join(item for item in items if item)
    if isinstance(value, dict):
        for key in ("markdown", "text", "content", "value"):
            if key in value:
                return json_value_to_text(value.get(key), suffix)
        return json.dumps(value, ensure_ascii=False)
    return clean_raw_document_text(str(value), suffix).strip()


def structured_patent_json_to_markdown(payload: dict, suffix: str) -> str | None:
    section_keys = ("title", "abstract", "description", "claims")
    if not any(key in payload for key in section_keys):
        return None

    title = json_value_to_text(payload.get("title"), suffix)
    parts: list[str] = []
    if title:
        title = re.sub(r"\s+", " ", title).strip()
        parts.append(f"# {title}")

    for key, label in (("abstract", "Abstract"), ("description", "Description"), ("claims", "Claims")):
        content = json_value_to_text(payload.get(key), suffix)
        if content:
            parts.extend([f"## {label}", content])

    return "\n\n".join(parts).strip() + ("\n" if parts else "")


def read_raw_markdown(raw_path: Path) -> str:
    text = read_text_flexible(raw_path)
    if raw_path.suffix.lower() in {".txt", ".json"}:
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            return clean_raw_document_text(text, raw_path.suffix)
        if isinstance(payload, dict):
            structured = structured_patent_json_to_markdown(payload, raw_path.suffix)
            if structured is not None:
                return structured
            if "markdown" in payload:
                return clean_raw_document_text(str(payload.get("markdown", "")), raw_path.suffix)
    return clean_raw_document_text(text, raw_path.suffix)


def default_state(raw_path: Path) -> AnnotationState:
    patent_id = patent_id_from_name(raw_path)
    return AnnotationState(
        document_id=raw_path.name,
        patent_id=patent_id,
        meta=Meta(source_type="patent", source_id=patent_id),
    )


def split_multi(value: str | None) -> list[str]:
    if not value or value == "-":
        return []
    return [item.strip() for item in value.split(" | ") if item.strip()]


def finite_starts(spans: list[EvidenceSpan]) -> list[int]:
    return [span.start for span in spans if isinstance(span.start, int)]


def record_offset(group: str, record: BaseModel) -> int:
    spans = getattr(record, "evidence_spans", [])
    identity = IDENTITY_FIELDS[group]
    identity_starts = finite_starts([span for span in spans if span.field == identity])
    if identity_starts:
        return min(identity_starts)
    fallback_starts = finite_starts(spans)
    return min(fallback_starts) if fallback_starts else 10**18


def measurement_evidence_text(record: MeasurementRecord) -> str:
    for span in record.evidence_spans:
        if span.field == "value" and span.text.strip():
            return span.text.strip()
    for span in record.evidence_spans:
        if span.text.strip():
            return span.text.strip()
    return ""


def normalize_measurement_scalar(value: str | float) -> str | float:
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value or "").strip()
    if not text or text == "-":
        return "-"
    return text


def normalize_amount_scalar(value: str | float) -> str | float:
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value or "").strip()
    if not text or text == "-":
        return "-"
    try:
        float(text)
        return text
    except ValueError:
        return "-"


def infer_amount_unit(text: str) -> str:
    unit = infer_measurement_unit(text)
    return unit[0] if unit else "-"


def infer_constituent_amount(value: str | float, unit: str = "-") -> dict:
    if isinstance(value, (int, float)):
        return {
            "amount_comparator": "=",
            "amount_value": float(value),
            "amount_unit": unit or "-",
            "amount_lower_value": "-",
            "amount_upper_value": "-",
        }
    text = str(value or "").strip()
    if not text or text == "-":
        return {
            "amount_comparator": "-",
            "amount_value": "-",
            "amount_unit": unit or "-",
            "amount_lower_value": "-",
            "amount_upper_value": "-",
        }
    if re.search(r"\b(balance|remainder|q\.?s\.?)\b", text, re.I):
        return {
            "amount_comparator": "balance",
            "amount_value": "-",
            "amount_unit": unit or infer_amount_unit(text),
            "amount_lower_value": "-",
            "amount_upper_value": "-",
        }
    numbers = [match.group(0) for match in re.finditer(r"(?<![A-Za-z])-?\d+(?:\.\d+)?(?![A-Za-z])", text)]
    inferred_unit = unit if unit and unit != "-" else infer_amount_unit(text)
    if len(numbers) >= 2 and ((re.search(r"\b(from|between)\b", text, re.I) and re.search(r"\b(to|and)\b", text, re.I)) or re.search(r"-?\d+(?:\.\d+)?\s*(?:-|â€“|â€”|~|to)\s*-?\d+(?:\.\d+)?", text, re.I)):
        return {
            "amount_comparator": "range",
            "amount_value": "-",
            "amount_unit": inferred_unit,
            "amount_lower_value": numbers[0],
            "amount_upper_value": numbers[1],
        }
    if numbers:
        comparator: AmountComparator = "="
        if re.search(r"(?:~|\bapprox(?:\.|imately)?\b|\baround\b|\babout\b|\bca\.?\b)", text, re.I):
            comparator = "approx"
        elif re.search(r"(?:>=|â‰¥|\bat least\b|\bno less than\b|\bnot less than\b)", text, re.I):
            comparator = ">="
        elif re.search(r"(?:<=|â‰¤|\bat most\b|\bno more than\b|\bnot more than\b)", text, re.I):
            comparator = "<="
        elif re.search(r"(?:>|greater than|more than|above|exceed)", text, re.I):
            comparator = ">"
        elif re.search(r"(?:<|less than|below|under)", text, re.I):
            comparator = "<"
        return {
            "amount_comparator": comparator,
            "amount_value": numbers[0],
            "amount_unit": inferred_unit,
            "amount_lower_value": "-",
            "amount_upper_value": "-",
        }
    return {
        "amount_comparator": "-",
        "amount_value": "-",
        "amount_unit": unit or "-",
        "amount_lower_value": "-",
        "amount_upper_value": "-",
    }


def normalize_measurement_array(values: list[str | float]) -> list[str | float]:
    normalized: list[str | float] = []
    for value in values:
        if isinstance(value, (int, float)):
            normalized.append(float(value))
            continue
        text = str(value).strip()
        if not text or text == "-":
            continue
        if "|" in text:
            normalized.extend(normalize_measurement_array([item.strip() for item in text.split("|") if item.strip()]))
            continue
        normalized.append(normalize_measurement_scalar(text))
    return normalized


def normalize_string_array(values: list[str]) -> list[str]:
    normalized: list[str] = []
    for value in values:
        for part in str(value).split("|"):
            cleaned = part.strip()
            if cleaned and cleaned != "-":
                normalized.append(cleaned)
    return normalized


def has_numeric_items(values: list[str | float]) -> bool:
    return any(is_numeric_measurement_scalar(value) for value in values)


def is_numeric_measurement_scalar(value: str | float) -> bool:
    if isinstance(value, (int, float)):
        return True
    text = str(value or "").strip()
    if not text or text == "-":
        return False
    try:
        float(text)
        return True
    except ValueError:
        return False


def first_measurement_scalar(*values: str | float | None) -> str | float:
    for value in values:
        if value is None:
            continue
        normalized = normalize_measurement_scalar(value)
        if normalized != "-":
            return normalized
    return "-"


def infer_measurement_unit(text: str) -> list[str]:
    matches = [
        match.group(1).rstrip("),.;:")
        for match in re.finditer(r"-?\d+(?:\.\d+)?\s*([A-Za-z%°µμ/^.~-][A-Za-z0-9%°µμ/^.~-]*)", text)
    ]
    return [match for match in matches if match and match.lower() not in {"to", "and"}][:1]


def infer_measurement_from_text(text: str) -> dict:
    source = text.strip()
    numbers = [match.group(0) for match in re.finditer(r"(?<![A-Za-z])-?\d+(?:\.\d+)?(?![A-Za-z])", source)]
    unit = infer_measurement_unit(source)
    if not numbers:
        return {"measurement_type": "qualitative", "comparator": "-", "value": [source] if source else [], "lower_value": "-", "upper_value": "-", "unit": ["-"] if source else []}
    if (re.search(r"\bbetween\b", source, re.I) and re.search(r"\band\b", source, re.I)) or (re.search(r"\bfrom\b", source, re.I) and re.search(r"\bto\b", source, re.I)) or re.search(r"\bto\b", source, re.I) or re.search(r"-?\d+(?:\.\d+)?\s*(?:-|–|—)\s*-?\d+(?:\.\d+)?", source):
        return {"measurement_type": "quantitative", "comparator": "range", "value": [], "lower_value": numbers[0] if numbers else "-", "upper_value": numbers[1] if len(numbers) > 1 else "-", "unit": unit}
    if re.search(r"(?:~|\bapprox(?:\.|imately)?\b|\baround\b|\babout\b|\bca\.?\b)", source, re.I):
        return {"measurement_type": "quantitative", "comparator": "approx", "value": [numbers[0]], "lower_value": "-", "upper_value": "-", "unit": unit}
    if re.search(r"(?:>=|≥|\bat least\b|\bno less than\b|\bnot less than\b)", source, re.I):
        return {"measurement_type": "quantitative", "comparator": ">=", "value": [numbers[0]], "lower_value": "-", "upper_value": "-", "unit": unit}
    if re.search(r"(?:<=|≤|\bat most\b|\bno more than\b|\bnot more than\b)", source, re.I):
        return {"measurement_type": "quantitative", "comparator": "<=", "value": [numbers[0]], "lower_value": "-", "upper_value": "-", "unit": unit}
    if re.search(r"(?:>|greater than|more than|above|exceed)", source, re.I):
        return {"measurement_type": "quantitative", "comparator": ">", "value": [numbers[0]], "lower_value": "-", "upper_value": "-", "unit": unit}
    if re.search(r"(?:<|less than|below|under)", source, re.I):
        return {"measurement_type": "quantitative", "comparator": "<", "value": [numbers[0]], "lower_value": "-", "upper_value": "-", "unit": unit}
    return {"measurement_type": "quantitative", "comparator": "=", "value": [numbers[0]], "lower_value": "-", "upper_value": "-", "unit": unit}


def infer_comparator_from_measurement_state(values: list[str | float], lower_value: str | float, upper_value: str | float) -> Comparator:
    if is_numeric_measurement_scalar(lower_value) and is_numeric_measurement_scalar(upper_value):
        return "range"
    if has_numeric_items(values):
        return "="
    return "-"


def normalize_measurement_record(record: MeasurementRecord) -> MeasurementRecord:
    value = normalize_measurement_array(record.value)
    unit = normalize_string_array(record.unit)
    lower_value = normalize_measurement_scalar(record.lower_value)
    upper_value = normalize_measurement_scalar(record.upper_value)
    record.comparator = "-" if record.measurement_type == "qualitative" else record.comparator
    if record.measurement_type == "qualitative":
        record.comparator = "-"
        record.value = [str(item).strip() for item in value if str(item).strip()]
        record.unit = ["-"]
        record.lower_value = "-"
        record.upper_value = "-"
    elif record.comparator == "range":
        record.value = []
        record.lower_value = first_measurement_scalar(lower_value)
        record.upper_value = first_measurement_scalar(upper_value)
        record.unit = unit
    else:
        record.value = value
        record.unit = unit
        record.lower_value = "-"
        record.upper_value = "-"
    for condition in record.measurement_conditions:
        condition.condition_name = condition.condition_name.strip() or "-"
        condition.condition_value = normalize_measurement_array(condition.condition_value)
        condition.condition_unit = normalize_string_array(condition.condition_unit)
    return record


def normalize_measurements(state: AnnotationState) -> AnnotationState:
    state.measurements = [normalize_measurement_record(record) for record in state.measurements]
    return state


def normalize_constituent_record(record: ConstituentRecord) -> ConstituentRecord:
    record.amount_unit = (record.amount_unit or "-").strip() or "-"
    record.function = (record.function or "-").strip() or "-"
    record.key_reason = (record.key_reason or "-").strip() or "-"
    if record.constituent_status == "-":
        record.constituent_status = "included"
    if record.constituent_status == "excluded":
        record.amount_comparator = "-"
        record.amount_value = "-"
        record.amount_unit = "-"
        record.amount_lower_value = "-"
        record.amount_upper_value = "-"
    elif record.amount_comparator == "range":
        record.amount_value = "-"
        record.amount_lower_value = normalize_amount_scalar(record.amount_lower_value)
        record.amount_upper_value = normalize_amount_scalar(record.amount_upper_value)
    elif record.amount_comparator == "balance":
        record.amount_value = "-"
        record.amount_lower_value = "-"
        record.amount_upper_value = "-"
    elif record.amount_comparator == "-":
        record.amount_value = "-"
        record.amount_lower_value = "-"
        record.amount_upper_value = "-"
        if not record.amount_unit:
            record.amount_unit = "-"
    else:
        record.amount_value = normalize_amount_scalar(record.amount_value)
        record.amount_lower_value = "-"
        record.amount_upper_value = "-"
    if record.amount_value == "-" and record.amount_lower_value == "-" and record.amount_upper_value == "-" and record.amount_comparator not in {"balance", "-"}:
        record.amount_comparator = "-"
    if record.key_constituent != "yes":
        record.key_reason = "-"
    return record


def normalize_compositions(state: AnnotationState) -> AnnotationState:
    for record in state.compositions:
        record.composition_type = record.composition_type.strip() or "-"
        record.physical_form = record.physical_form.strip() or "-"
        record.constituents = [normalize_constituent_record(entry) for entry in record.constituents if entry.constituent_ref > 0]
    return state


def graph_id(group: str, node_no: int) -> str:
    return {"substances": "s", "compositions": "c", "properties": "p", "measurements": "m"}[group] + f"-{node_no}"


def parse_graph_id(raw_id: str) -> tuple[str, int] | None:
    prefix, _, raw_no = raw_id.partition("-")
    group = {"s": "substances", "c": "compositions", "p": "properties", "m": "measurements"}.get(prefix)
    if not group:
        return None
    try:
        return group, int(raw_no)
    except ValueError:
        return None


def remap_graph_layout(state: AnnotationState, maps: dict[str, dict[int, int]]) -> dict[str, GraphPosition]:
    remapped = {}
    for raw_id, position in state.graph_layout.items():
        parsed = parse_graph_id(raw_id)
        if not parsed:
            continue
        group, old_no = parsed
        remapped[graph_id(group, maps[group].get(old_no, old_no))] = position
    valid_ids = {
        *(graph_id("substances", item.node_no) for item in state.substances),
        *(graph_id("compositions", item.node_no) for item in state.compositions),
        *(graph_id("properties", item.node_no) for item in state.properties),
        *(graph_id("measurements", item.node_no) for item in state.measurements),
    }
    return {raw_id: position for raw_id, position in remapped.items() if raw_id in valid_ids}


def remap_material_ref(ref: int, maps: dict[str, dict[int, int]]) -> int:
    if ref in maps["substances"]:
        return maps["substances"][ref]
    if ref in maps["compositions"]:
        return maps["compositions"][ref]
    return ref


def normalize_node_numbers(state: AnnotationState) -> AnnotationState:
    maps: dict[str, dict[int, int]] = {group: {} for group in ENTITY_ORDER}
    grouped = {
        "substances": sorted(state.substances, key=lambda item: (record_offset("substances", item), item.node_no)),
        "compositions": sorted(state.compositions, key=lambda item: (record_offset("compositions", item), item.node_no)),
        "properties": sorted(state.properties, key=lambda item: (record_offset("properties", item), item.node_no)),
        "measurements": sorted(state.measurements, key=lambda item: (record_offset("measurements", item), item.node_no)),
    }
    next_no = 1
    for group in ENTITY_ORDER:
        for record in grouped[group]:
            maps[group][record.node_no] = next_no
            next_no += 1

    for record in grouped["substances"]:
        record.node_no = maps["substances"].get(record.node_no, record.node_no)
    for record in grouped["compositions"]:
        record.node_no = maps["compositions"].get(record.node_no, record.node_no)
        for entry in record.constituents:
            entry.constituent_ref = remap_material_ref(entry.constituent_ref, maps)
    for record in grouped["properties"]:
        record.node_no = maps["properties"].get(record.node_no, record.node_no)
        record.target_ref = remap_material_ref(record.target_ref, maps) if record.target_ref > 0 else 0
    for record in grouped["measurements"]:
        record.node_no = maps["measurements"].get(record.node_no, record.node_no)
        record.property_ref = maps["properties"].get(record.property_ref, record.property_ref)

    state.substances = grouped["substances"]
    state.compositions = grouped["compositions"]
    state.properties = grouped["properties"]
    state.measurements = grouped["measurements"]
    state.graph_layout = remap_graph_layout(state, maps)
    return state


def target_refs_from_raw(value) -> list[int]:
    values = value if isinstance(value, list) else [value]
    refs = []
    for item in values:
        try:
            ref = int(item)
        except (TypeError, ValueError):
            continue
        if ref > 0 and ref not in refs:
            refs.append(ref)
    return refs


def migrate_raw_schema(raw: dict) -> dict:
    substances = raw.get("substances", [])
    compositions = raw.get("compositions", [])
    properties = raw.get("properties", [])
    measurements = raw.get("measurements", [])
    if not isinstance(substances, list) or not isinstance(compositions, list) or not isinstance(properties, list):
        return raw
    targets_by_no = {}
    for item in substances:
        if not isinstance(item, dict):
            continue
        if not item.get("physical_form") and item.get("structural"):
            item["physical_form"] = item.get("structural", "-")
        item.setdefault("physical_form", "-")
        item.pop("structural", None)
        for span in item.get("evidence_spans", []) if isinstance(item.get("evidence_spans"), list) else []:
            if isinstance(span, dict) and span.get("field") == "structural":
                span["field"] = "physical_form"
        try:
            targets_by_no[int(item.get("node_no", 0))] = item
        except (TypeError, ValueError):
            continue
    for item in compositions:
        if not isinstance(item, dict):
            continue
        if not item.get("physical_form") and item.get("structural"):
            item["physical_form"] = item.get("structural", "-")
        item.setdefault("physical_form", "-")
        item.pop("structural", None)
        for span in item.get("evidence_spans", []) if isinstance(item.get("evidence_spans"), list) else []:
            if isinstance(span, dict) and span.get("field") == "structural":
                span["field"] = "physical_form"
        migrated_constituents = []
        for entry in item.get("constituents", []) if isinstance(item.get("constituents"), list) else []:
            if not isinstance(entry, dict):
                continue
            migrated = dict(entry)
            migrated.pop("constituent_type", None)
            migrated.setdefault("constituent_status", "included")
            if "amount_comparator" not in migrated:
                migrated.update(infer_constituent_amount(migrated.get("amount_value", "-"), str(migrated.get("amount_unit", "-") or "-")))
            migrated.setdefault("amount_value", "-")
            migrated.setdefault("amount_unit", "-")
            migrated.setdefault("amount_lower_value", "-")
            migrated.setdefault("amount_upper_value", "-")
            migrated.setdefault("function", "-")
            migrated.setdefault("key_constituent", "-")
            migrated.setdefault("key_reason", "-")
            migrated_constituents.append(migrated)
        item["constituents"] = migrated_constituents
        try:
            targets_by_no[int(item.get("node_no", 0))] = item
        except (TypeError, ValueError):
            continue

    node_numbers = [0]
    for group in (substances, compositions, properties, measurements):
        if not isinstance(group, list):
            continue
        for item in group:
            if not isinstance(item, dict):
                continue
            try:
                node_numbers.append(int(item.get("node_no", 0)))
            except (TypeError, ValueError):
                continue
    max_node_no = max(node_numbers)
    first_property_for_old_no: dict[int, int] = {}
    migrated_properties = []
    for item in properties:
        if not isinstance(item, dict):
            continue
        if item.get("property_type") == "constitutive":
            item["property_type"] = "performance"
        structural = item.pop("structural", "-") or "-"
        spans = item.get("evidence_spans", [])
        structural_spans = [span for span in spans if isinstance(span, dict) and span.get("field") == "structural"] if isinstance(spans, list) else []
        refs = target_refs_from_raw(item.get("target_ref"))
        for ref in refs:
            target = targets_by_no.get(ref)
            if not target:
                continue
            if structural != "-" and target.get("physical_form", "-") in {"", "-"}:
                target["physical_form"] = structural
            destination_spans = target.setdefault("evidence_spans", [])
            if isinstance(destination_spans, list):
                for span in structural_spans:
                    migrated_span = dict(span)
                    migrated_span["field"] = "physical_form"
                    if migrated_span not in destination_spans:
                        destination_spans.append(migrated_span)
        if isinstance(spans, list):
            item["evidence_spans"] = [span for span in spans if not (isinstance(span, dict) and span.get("field") == "structural")]
        old_no = int(item.get("node_no", 0) or 0)
        if not refs:
            item["target_ref"] = 0
            migrated_properties.append(item)
            first_property_for_old_no[old_no] = old_no
            continue
        for index, ref in enumerate(refs):
            next_item = dict(item)
            if index == 0:
                next_no = old_no
            else:
                max_node_no += 1
                next_no = max_node_no
            next_item["node_no"] = next_no
            next_item["target_ref"] = ref
            migrated_properties.append(next_item)
            if old_no and old_no not in first_property_for_old_no:
                first_property_for_old_no[old_no] = next_no
    raw["properties"] = migrated_properties

    if isinstance(measurements, list):
        for item in measurements:
            if not isinstance(item, dict):
                continue
            try:
                old_ref = int(item.get("property_ref", 0))
            except (TypeError, ValueError):
                old_ref = 0
            item["property_ref"] = first_property_for_old_no.get(old_ref, old_ref)
    return raw


def migrate_legacy_state(raw: dict, raw_path: Path) -> AnnotationState:
    state = default_state(raw_path)
    state.status = raw.get("status", "Unannotated")
    for item in raw.get("components", []):
        spans = [EvidenceSpan.model_validate(span) for span in item.get("evidence_spans", [])]
        state.substances.append(
            SubstanceRecord(
                node_no=int(item.get("node_no", len(state.substances) + 1)),
                substance_name=item.get("component_name", "-"),
                substance_type="raw",
                manufacturer="-",
                evidence_text=spans[0].text if spans else item.get("component_name", "-"),
                evidence_spans=spans,
            )
        )
    for item in raw.get("formulations", []):
        spans = [EvidenceSpan.model_validate(span) for span in item.get("evidence_spans", [])]
        state.compositions.append(
            CompositionRecord(
                node_no=int(item.get("node_no", len(state.compositions) + 1)),
                composition_name=item.get("formulation_ref", "-"),
                composition_type="formulation",
                physical_form=item.get("physical_form", item.get("structural", "-")),
                constituents=[ConstituentRecord(constituent_ref=int(ref), constituent_status="included") for ref in item.get("combo", [])],
                evidence_text=spans[0].text if spans else item.get("formulation_ref", "-"),
                evidence_spans=spans,
            )
        )
    next_measurement_no = max(
        [0]
        + [item.node_no for item in state.substances]
        + [item.node_no for item in state.compositions]
        + [int(item.get("node_no", 0)) for item in raw.get("performances", [])]
    ) + 1
    for item in raw.get("performances", []):
        spans = [EvidenceSpan.model_validate(span) for span in item.get("evidence_spans", [])]
        prop_no = int(item.get("node_no", len(state.properties) + 1))
        state.properties.append(
            PropertyRecord(
                node_no=prop_no,
                property_name=item.get("performance_metric", "-"),
                property_type="performance",
                target_ref=target_refs_from_raw(item.get("formulation"))[0] if target_refs_from_raw(item.get("formulation")) else 0,
                evidence_text=spans[0].text if spans else item.get("performance_metric", "-"),
                evidence_spans=spans,
            )
        )
        values = split_multi(item.get("quantitative_value_map"))
        if values:
            state.measurements.append(
                MeasurementRecord(
                    node_no=next_measurement_no,
                    property_ref=prop_no,
                    value=values,
                    unit=split_multi(item.get("units_map")),
                    evidence_text=" | ".join(values),
                    evidence_spans=[span for span in spans if span.field in {"quantitative_value_map", "units_map"}],
                )
            )
            next_measurement_no += 1
    return state


def parse_state(text: str, raw_path: Path) -> AnnotationState:
    raw = json.loads(text)
    if {"components", "formulations", "performances"} & set(raw):
        return normalize_node_numbers(normalize_compositions(normalize_measurements(migrate_legacy_state(raw, raw_path))))
    raw = migrate_raw_schema(raw)
    raw.setdefault("document_id", raw_path.name)
    raw.setdefault("patent_id", patent_id_from_name(raw_path))
    if isinstance(raw.get("meta"), dict) and raw["meta"].get("status") and not raw.get("status"):
        raw["status"] = raw["meta"].get("status")
    state = AnnotationState.model_validate(raw)
    state.document_id = raw_path.name
    if not state.patent_id:
        state.patent_id = patent_id_from_name(raw_path)
    if not state.meta.source_id or state.meta.source_id == "-":
        state.meta.source_id = state.patent_id or patent_id_from_name(raw_path)
    return normalize_node_numbers(normalize_compositions(normalize_measurements(state)))


def load_state(raw_path: Path) -> tuple[AnnotationState, Path | None]:
    annotation_path = selected_annotation_path(raw_path)
    if not annotation_path:
        return default_state(raw_path), None
    try:
        return parse_state(annotation_path.read_text(encoding="utf-8-sig"), raw_path), annotation_path
    except (json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(status_code=500, detail=f"Saved annotation is invalid: {annotation_path.name}") from exc


def state_counts(state: AnnotationState) -> dict:
    return {
        "substances": len(state.substances),
        "compositions": len(state.compositions),
        "properties": len(state.properties),
        "measurements": len(state.measurements),
    }


def file_summary(path: Path) -> dict:
    state, annotation_path = load_state(path)
    return {
        "kind": "file",
        "document_id": path.name,
        "patent_id": patent_id_from_name(path),
        "status": state.status if annotation_path else "Unannotated",
        "counts": state_counts(state),
        "annotation_path": str(annotation_path) if annotation_path else None,
        "updated_at": annotation_path.stat().st_mtime if annotation_path else path.stat().st_mtime,
        "path": str(path),
    }


def folder_summary(path: Path) -> dict:
    return {
        "kind": "folder",
        "document_id": path.name,
        "patent_id": "",
        "status": "Unannotated",
        "counts": {
            "substances": 0,
            "compositions": 0,
            "properties": 0,
            "measurements": 0,
        },
        "annotation_path": None,
        "updated_at": path.stat().st_mtime,
        "path": str(path),
    }


def workspace_files(path: Path) -> list[dict]:
    entries = []
    for item in sorted(path.iterdir(), key=lambda value: (not value.is_dir(), value.name.lower())):
        if item.is_dir():
            entries.append(folder_summary(item))
        elif is_raw_text_file(item):
            entries.append(file_summary(item))
    return entries


def workspace_payload(path: Path | None) -> WorkspacePayload:
    if not path:
        return WorkspacePayload()
    parent = path.parent if path.parent != path else None
    return WorkspacePayload(
        path=str(path),
        parent_path=str(parent) if parent else None,
        files=workspace_files(path),
    )


def strip_internal(record: BaseModel) -> dict:
    data = record.model_dump()
    data.pop("evidence_spans", None)
    return data


def meta_with_status(state: AnnotationState) -> dict:
    meta = state.meta.model_dump()
    meta["status"] = state.status
    return meta


def serialize_saved_state(state: AnnotationState) -> dict:
    data = state.model_dump()
    data.pop("document_id", None)
    data.pop("patent_id", None)
    data.pop("status", None)
    data["meta"] = meta_with_status(state)
    return data


def export_schema(state: AnnotationState) -> dict:
    state = normalize_node_numbers(normalize_compositions(normalize_measurements(state)))
    return {
        "meta": meta_with_status(state),
        "substances": [strip_internal(item) for item in state.substances],
        "compositions": [strip_internal(item) for item in state.compositions],
        "properties": [strip_internal(item) for item in state.properties],
        "measurements": [strip_internal(item) for item in state.measurements],
    }


@app.get("/api/workspace", response_model=WorkspacePayload)
def get_workspace() -> WorkspacePayload:
    path = current_workspace(required=False)
    return workspace_payload(path)


@app.post("/api/workspace/open", response_model=WorkspacePayload)
def open_workspace(request: OpenWorkspaceRequest) -> WorkspacePayload:
    path = set_workspace(request.path)
    return workspace_payload(path)


@app.post("/api/workspace/pick-folder", response_model=WorkspacePayload)
def pick_workspace_folder() -> WorkspacePayload:
    configured = configured_workspace()
    if configured:
        return workspace_payload(configured)
    try:
        import tkinter as tk
        from tkinter import filedialog
    except Exception as exc:  # pragma: no cover - depends on local Python install
        raise HTTPException(status_code=500, detail="Folder picker is not available on this system.") from exc

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    root.update()
    try:
        initial_dir = str(current_workspace(required=False) or Path.home())
        selected = filedialog.askdirectory(initialdir=initial_dir, title="Select working folder", mustexist=True)
    finally:
        root.destroy()

    if not selected:
        return workspace_payload(current_workspace(required=False))
    return workspace_payload(set_workspace(selected))


@app.get("/api/workspace/files")
def list_workspace_files() -> list[dict]:
    path = current_workspace()
    assert path is not None
    return workspace_files(path)


@app.get("/api/workspace/files/{file_name:path}", response_model=DocumentPayload)
def get_document(file_name: str) -> DocumentPayload:
    path = raw_file_path(file_name)
    state, annotation_path = load_state(path)
    return DocumentPayload(
        document_id=path.name,
        patent_id=patent_id_from_name(path),
        markdown=read_raw_markdown(path),
        state=state,
        annotation_path=str(annotation_path) if annotation_path else None,
        revision=document_revision(path),
    )


@app.put("/api/workspace/files/{file_name:path}/annotations")
def save_annotations(file_name: str, state: AnnotationState, request: Request) -> dict:
    path = raw_file_path(file_name)
    if state.document_id != path.name:
        raise HTTPException(status_code=400, detail="Document id mismatch")
    expected_revision = request.headers.get("x-annotation-revision")
    current_revision = document_revision(path)
    if expected_revision is not None and expected_revision != current_revision:
        raise HTTPException(status_code=409, detail="This document changed after you opened it. Refresh the file before saving again.")
    state = normalize_node_numbers(normalize_compositions(normalize_measurements(state)))
    out = save_path_for_status(path, state.status)
    write_text_atomic(out, json.dumps(serialize_saved_state(state), indent=2, ensure_ascii=False))
    remove_stale_annotation_files(path, out)
    return {"state": state, "summary": file_summary(path), "path": str(out), "revision": document_revision(path)}


@app.post("/api/workspace/files/{file_name:path}/export")
def export_document(file_name: str) -> dict:
    path = raw_file_path(file_name)
    state, _ = load_state(path)
    out = path.with_name(f"{path.stem}.schema.json")
    exported = export_schema(state)
    write_text_atomic(out, json.dumps(exported, separators=(",", ":"), ensure_ascii=False))
    return {"path": str(out), "schema": exported}


@app.get("/api/health")
def health() -> dict:
    path = current_workspace(required=False)
    return {"status": "ok", "workspace": str(path) if path else None, "documents": len(workspace_files(path)) if path else 0}


if FRONTEND_DIST.is_dir():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/", include_in_schema=False)
    def frontend_index() -> FileResponse:
        return FileResponse(FRONTEND_DIST / "index.html")
