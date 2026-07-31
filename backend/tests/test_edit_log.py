from __future__ import annotations

import importlib
import json
import os
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient


ENV_KEYS = (
    "ANNOTATION_USERS_JSON",
    "ANNOTATION_APP_USERNAME",
    "ANNOTATION_APP_PASSWORD",
    "ANNOTATION_SESSION_SECRET",
    "ANNOTATION_WORKSPACE_PATH",
    "ANNOTATION_SEED_WORKSPACE",
)


class EditLogTests(unittest.TestCase):
    def setUp(self) -> None:
        self.workspace = tempfile.TemporaryDirectory()
        self.workspace_path = Path(self.workspace.name)
        self.raw_name = "1. example.json"
        self.raw_path = self.workspace_path / self.raw_name
        self.raw_path.write_text(json.dumps({"markdown": "Example source document"}), encoding="utf-8")
        self.baseline_path = self.workspace_path / "1. example_llm_annotated.json"
        self.baseline_path.write_text(json.dumps(self.baseline_state(), indent=2), encoding="utf-8")

        self.saved_env = {key: os.environ.get(key) for key in ENV_KEYS}
        for key in ENV_KEYS:
            os.environ.pop(key, None)
        os.environ.update(
            {
                "ANNOTATION_WORKSPACE_PATH": self.workspace.name,
                "ANNOTATION_SEED_WORKSPACE": "0",
            }
        )

        import backend.main

        self.backend = importlib.reload(backend.main)
        self.client = TestClient(self.backend.app)

    def tearDown(self) -> None:
        self.client.close()
        for key in ENV_KEYS:
            os.environ.pop(key, None)
        for key, value in self.saved_env.items():
            if value is not None:
                os.environ[key] = value
        self.workspace.cleanup()

    def baseline_state(self) -> dict:
        return {
            "document_id": self.raw_name,
            "status": "Partially complete",
            "meta": {"source_type": "patent", "source_id": "example"},
            "substances": [
                {"node_no": 1, "substance_name": "Al alloy", "evidence_text": "Al alloy"},
                {"node_no": 4, "substance_name": "Copper", "evidence_text": "Copper"},
            ],
            "compositions": [
                {
                    "node_no": 8,
                    "composition_name": "Alloy",
                    "constituents": [
                        {
                            "constituent_ref": 1,
                            "amount_comparator": "=",
                            "amount_value": 1.0,
                            "amount_unit": "wt%",
                        }
                    ],
                    "evidence_text": "Alloy",
                }
            ],
            "properties": [
                {
                    "node_no": 11,
                    "property_name": "Strength",
                    "target_ref": 1,
                    "evidence_text": "Strength",
                }
            ],
            "measurements": [
                {
                    "node_no": 14,
                    "property_ref": 11,
                    "value": [500],
                    "unit": ["MPa"],
                    "evidence_text": "500 MPa",
                }
            ],
        }

    def user_state(self, status: str = "Partially complete") -> dict:
        return {
            "document_id": self.raw_name,
            "status": status,
            "meta": {"source_type": "patent", "source_id": "example"},
            "substances": [
                {"node_no": 1, "substance_name": "Aluminium alloy", "evidence_text": "Al alloy"},
                {"node_no": "U7", "substance_name": "Magnesium", "evidence_text": "Magnesium"},
            ],
            "compositions": [
                {
                    "node_no": 8,
                    "composition_name": "Alloy",
                    "constituents": [
                        {
                            "constituent_ref": 1,
                            "amount_comparator": "=",
                            "amount_value": 2.5,
                            "amount_unit": "wt%",
                        }
                    ],
                    "evidence_text": "Alloy",
                },
                {
                    "node_no": "U12",
                    "composition_name": "User blend",
                    "constituents": [{"constituent_ref": "U7"}],
                    "evidence_text": "User blend",
                },
            ],
            "properties": [
                {
                    "node_no": 11,
                    "property_name": "Strength",
                    "target_ref": 1,
                    "evidence_text": "Strength",
                },
                {
                    "node_no": "U20",
                    "property_name": "Density",
                    "target_ref": "U7",
                    "evidence_text": "Density",
                },
            ],
            "measurements": [
                {
                    "node_no": 14,
                    "property_ref": 11,
                    "value": [550],
                    "unit": ["MPa"],
                    "evidence_text": "500 MPa",
                },
                {
                    "node_no": "U25",
                    "property_ref": "U20",
                    "value": [2.1],
                    "unit": ["g/cm3"],
                    "evidence_text": "2.1 g/cm3",
                },
            ],
        }

    def save_user_state(self, state: dict, revision: str = "0") -> dict:
        response = self.client.put(
            "/api/workspace/files/1.%20example.json/annotations",
            headers={"X-Annotation-Revision": revision},
            json=state,
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_save_preserves_original_ids_compacts_user_ids_and_creates_log(self) -> None:
        listing = self.client.get("/api/workspace").json()["files"]
        self.assertEqual([entry["document_id"] for entry in listing], [self.raw_name])

        saved = self.save_user_state(self.user_state())
        self.assertIsNone(saved["edit_log_warning"])
        self.assertEqual(Path(saved["edit_log_path"]).name, "1. example_edit_log.json")

        state = saved["state"]
        self.assertEqual([item["node_no"] for item in state["substances"]], [1, "U1"])
        self.assertEqual([item["node_no"] for item in state["compositions"]], [8, "U2"])
        self.assertEqual([item["node_no"] for item in state["properties"]], [11, "U3"])
        self.assertEqual([item["node_no"] for item in state["measurements"]], [14, "U4"])
        self.assertEqual(state["compositions"][1]["constituents"][0]["constituent_ref"], "U1")
        self.assertEqual(state["properties"][1]["target_ref"], "U1")
        self.assertEqual(state["measurements"][1]["property_ref"], "U3")

        response = self.client.get("/api/workspace/edit-logs/1.%20example.json")
        self.assertEqual(response.status_code, 200, response.text)
        edit_log = response.json()["edit_log"]
        self.assertEqual(
            edit_log["meta"],
            {
                "source_type": "patent",
                "source_id": "example",
                "summary": {
                    "original_nodes_unchanged": 1,
                    "original_nodes_modified": 3,
                    "original_nodes_deleted": 1,
                    "user_nodes_added": 4,
                },
            },
        )
        self.assertEqual(
            edit_log["substances"][0],
            {
                "node_no": 1,
                "change_type": "modified",
                "fields": {
                    "substance_name": {
                        "change_type": "modified",
                        "value": "Aluminium alloy",
                    }
                },
            },
        )
        self.assertEqual(edit_log["substances"][1], {"node_no": 4, "change_type": "deleted"})
        self.assertEqual(
            edit_log["substances"][2],
            {
                "node_no": "U1",
                "change_type": "added",
                "fields": {
                    "substance_name": "Magnesium",
                    "substance_type": "raw",
                    "evidence_text": "Magnesium",
                },
            },
        )
        self.assertNotIn("physical_form", edit_log["substances"][2]["fields"])
        self.assertNotIn("evidence_spans", edit_log["substances"][2]["fields"])
        self.assertEqual([item["node_no"] for item in edit_log["compositions"]], [8, "U2"])
        self.assertEqual(
            edit_log["compositions"][0],
            {
                "node_no": 8,
                "change_type": "modified",
                "fields": {
                    "constituents": [
                        {
                            "constituent_ref": 1,
                            "amount_value": {
                                "change_type": "modified",
                                "value": 2.5,
                            },
                        }
                    ]
                },
            },
        )
        self.assertNotIn("composition_name", edit_log["compositions"][0]["fields"])
        self.assertEqual(
            edit_log["compositions"][1]["fields"]["constituents"],
            [{"constituent_ref": "U1", "constituent_status": "included"}],
        )
        self.assertNotIn("amount_value", edit_log["compositions"][1]["fields"]["constituents"][0])
        self.assertEqual([item["node_no"] for item in edit_log["properties"]], ["U3"])
        self.assertEqual([item["node_no"] for item in edit_log["measurements"]], [14, "U4"])
        self.assertEqual(edit_log["measurements"][0], {"node_no": 14, "change_type": "modified"})
        self.assertNotIn("fields", edit_log["measurements"][0])
        self.assertEqual(edit_log["measurements"][1]["fields"]["value"], [2.1])
        serialized = json.dumps(edit_log)
        self.assertNotIn('"change_type": "added", "value"', serialized)
        self.assertNotIn("llm_value", serialized)
        self.assertNotIn("original_nodes\"", serialized)
        self.assertNotIn("modified_fields", serialized)
        self.assertNotIn("by_category", serialized)

        document = self.client.get("/api/workspace/files/1.%20example.json").json()
        self.assertTrue(Path(document["llm_baseline_path"]).samefile(self.baseline_path))
        self.assertTrue(Path(document["edit_log_path"]).samefile(saved["edit_log_path"]))

    def test_duplicate_constituent_refs_are_logged_as_ref_group(self) -> None:
        baseline = self.baseline_state()
        baseline["compositions"][0]["constituents"] = [
            {
                "constituent_ref": 1,
                "amount_comparator": "<=",
                "amount_value": 5.0,
                "amount_unit": "wt%",
            },
            {
                "constituent_ref": 1,
                "amount_comparator": "range",
                "amount_lower_value": 2.0,
                "amount_upper_value": 3.0,
                "amount_unit": "wt%",
            },
        ]
        self.baseline_path.write_text(json.dumps(baseline, indent=2), encoding="utf-8")

        user = json.loads(json.dumps(baseline))
        user["compositions"][0]["constituents"][1]["amount_upper_value"] = 3.5

        saved = self.save_user_state(user)
        self.assertIsNone(saved["edit_log_warning"])

        response = self.client.get("/api/workspace/edit-logs/1.%20example.json")
        self.assertEqual(response.status_code, 200, response.text)
        edit_log = response.json()["edit_log"]
        self.assertEqual(
            edit_log["compositions"],
            [
                {
                    "node_no": 8,
                    "change_type": "modified",
                    "fields": {
                        "constituents": [
                            {
                                "constituent_ref": 1,
                                "change_type": "modified",
                                "value": [
                                    {
                                        "constituent_status": "included",
                                        "amount_comparator": "<=",
                                        "amount_value": 5.0,
                                        "amount_unit": "wt%",
                                    },
                                    {
                                        "constituent_status": "included",
                                        "amount_comparator": "range",
                                        "amount_unit": "wt%",
                                        "amount_lower_value": 2.0,
                                        "amount_upper_value": 3.5,
                                    },
                                ],
                            }
                        ]
                    },
                }
            ],
        )

    def test_schema_export_includes_sanitized_evidence_spans(self) -> None:
        state = self.user_state()
        state["substances"][0]["evidence_spans"] = [
            {
                "field": "substance_name",
                "text": "Al alloy",
                "start": 10,
                "end": 18,
                "primary": True,
            }
        ]
        state["substances"][1]["evidence_spans"] = [
            {
                "field": "substance_name",
                "text": "Magnesium",
                "start": 44,
                "end": 53,
                "primary": True,
            }
        ]
        self.save_user_state(state)

        response = self.client.post("/api/workspace/files/1.%20example.json/export")
        self.assertEqual(response.status_code, 200, response.text)
        schema = response.json()["schema"]
        self.assertEqual(
            schema["substances"][0]["evidence_spans"],
            [{"field": "substance_name", "text": "Al alloy"}],
        )
        self.assertEqual(
            schema["substances"][1]["evidence_spans"],
            [{"field": "substance_name", "text": "Magnesium"}],
        )
        serialized = json.dumps(schema)
        self.assertNotIn('"start"', serialized)
        self.assertNotIn('"end"', serialized)
        self.assertNotIn('"primary"', serialized)

    def test_deleting_user_node_recompacts_only_user_ids_and_references(self) -> None:
        first = self.save_user_state(self.user_state())
        next_state = first["state"]
        next_state["compositions"] = [item for item in next_state["compositions"] if item["node_no"] != "U2"]
        second = self.save_user_state(next_state, first["revision"])

        state = second["state"]
        self.assertEqual([item["node_no"] for item in state["substances"]], [1, "U1"])
        self.assertEqual([item["node_no"] for item in state["compositions"]], [8])
        self.assertEqual([item["node_no"] for item in state["properties"]], [11, "U2"])
        self.assertEqual([item["node_no"] for item in state["measurements"]], [14, "U3"])
        self.assertEqual(state["measurements"][1]["property_ref"], "U2")
        self.assertEqual([1, 8, 11, 14], [
            state["substances"][0]["node_no"],
            state["compositions"][0]["node_no"],
            state["properties"][0]["node_no"],
            state["measurements"][0]["node_no"],
        ])

    def test_completed_save_preserves_baseline_and_overwrites_same_log(self) -> None:
        first = self.save_user_state(self.user_state())
        completed_state = first["state"]
        completed_state["status"] = "Completed"
        completed = self.save_user_state(completed_state, first["revision"])

        self.assertTrue((self.workspace_path / "1. example_annotated.json").is_file())
        self.assertFalse((self.workspace_path / "1. example_partially_annotated.json").exists())
        self.assertTrue(self.baseline_path.is_file())
        self.assertEqual(Path(completed["edit_log_path"]).name, "1. example_edit_log.json")
        self.assertEqual(len(list(self.workspace_path.glob("*_edit_log.json"))), 1)

    def test_missing_baseline_saves_annotation_warns_and_removes_stale_log(self) -> None:
        first = self.save_user_state(self.user_state())
        edit_log_path = Path(first["edit_log_path"])
        self.assertTrue(edit_log_path.is_file())
        self.baseline_path.unlink()

        second = self.save_user_state(first["state"], first["revision"])
        self.assertIsNone(second["edit_log_path"])
        self.assertIn("is missing", second["edit_log_warning"])
        self.assertFalse(edit_log_path.exists())
        self.assertTrue((self.workspace_path / "1. example_partially_annotated.json").is_file())
        response = self.client.get("/api/workspace/edit-logs/1.%20example.json")
        self.assertEqual(response.status_code, 404)

    def test_unrecognized_baseline_shape_does_not_compare_as_blank(self) -> None:
        self.baseline_path.write_text(json.dumps({"annotation": self.baseline_state()}), encoding="utf-8")
        saved = self.save_user_state(self.user_state())
        self.assertIsNone(saved["edit_log_path"])
        self.assertIn("does not contain top-level annotation sections", saved["edit_log_warning"])


if __name__ == "__main__":
    unittest.main()
