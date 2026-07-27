from __future__ import annotations

import base64
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
    "ANNOTATION_WORKSPACE_PATH",
    "ANNOTATION_SEED_WORKSPACE",
)


def basic_auth(username: str, password: str) -> dict[str, str]:
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


class MultiUserAccessTests(unittest.TestCase):
    def setUp(self) -> None:
        self.workspace = tempfile.TemporaryDirectory()
        workspace_path = Path(self.workspace.name)
        for name in ("1. alpha.txt", "2. beta.txt", "3. gamma.txt"):
            (workspace_path / name).write_text(f"Source document {name}", encoding="utf-8")

        self.saved_env = {key: os.environ.get(key) for key in ENV_KEYS}
        for key in ENV_KEYS:
            os.environ.pop(key, None)
        os.environ.update(
            {
                "ANNOTATION_WORKSPACE_PATH": self.workspace.name,
                "ANNOTATION_SEED_WORKSPACE": "0",
                "ANNOTATION_USERS_JSON": json.dumps(
                    [
                        {"username": "alice", "password": "alice-pass", "document_globs": ["1.*", "2.*"]},
                        {"username": "bob", "password": "bob-pass", "document_globs": ["3.*"]},
                        {"username": "admin", "password": "admin-pass", "document_globs": ["*"]},
                    ]
                ),
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

    def test_authentication_and_filtered_workspace(self) -> None:
        self.assertEqual(self.client.get("/api/workspace").status_code, 401)
        self.assertEqual(
            self.client.get("/api/workspace", headers=basic_auth("alice", "wrong")).status_code,
            401,
        )

        alice_response = self.client.get("/api/workspace", headers=basic_auth("alice", "alice-pass"))
        self.assertEqual(alice_response.status_code, 200)
        self.assertEqual(
            [entry["document_id"] for entry in alice_response.json()["files"]],
            ["1. alpha.txt", "2. beta.txt"],
        )

        admin_response = self.client.get("/api/workspace/files", headers=basic_auth("admin", "admin-pass"))
        self.assertEqual(admin_response.status_code, 200)
        self.assertEqual(len(admin_response.json()), 3)

    def test_direct_read_save_and_export_are_enforced(self) -> None:
        alice_headers = basic_auth("alice", "alice-pass")
        bob_headers = basic_auth("bob", "bob-pass")

        self.assertEqual(
            self.client.get("/api/workspace/files/1.%20alpha.txt", headers=alice_headers).status_code,
            200,
        )
        self.assertEqual(
            self.client.get("/api/workspace/files/1.%20alpha.txt", headers=bob_headers).status_code,
            404,
        )
        self.assertEqual(
            self.client.put(
                "/api/workspace/files/1.%20alpha.txt/annotations",
                headers=bob_headers,
                json={"document_id": "1. alpha.txt"},
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.post("/api/workspace/files/1.%20alpha.txt/export", headers=bob_headers).status_code,
            404,
        )

    def test_health_is_public_without_leaking_assignments(self) -> None:
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["documents"], 3)

    def test_configuration_rejects_missing_assignments(self) -> None:
        with self.assertRaisesRegex(ValueError, "non-empty"):
            self.backend.parse_configured_users("")
        with self.assertRaisesRegex(ValueError, "document_glob"):
            self.backend.parse_configured_users('[{"username":"user","password":"pass"}]')


if __name__ == "__main__":
    unittest.main()
