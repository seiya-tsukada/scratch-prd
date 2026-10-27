"""旧 localStorage データ（idea_workspace_*_v2）の取り込み"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend.app import config

IMPORT = "/api/import/local-project"


def legacy_payload() -> dict[str, Any]:
    """旧 LocalStorageWorkspaceRepository が保存していた形（ID は文字列、userId などの余計な項目つき）"""
    return {
        "project": {
            "id": "proj-1700000000000",
            "userId": "usr-default-01",
            "name": "旧プロジェクト",
            "description": "説明",
            "createdAt": "2025-01-02T03:04:05.678Z",
            "updatedAt": "2025-01-03T03:04:05.678Z",
        },
        "sections": [
            {"id": "sec-b", "projectId": "proj-1700000000000", "name": "B", "position": 1, "icon": "Users"},
            {"id": "sec-a", "projectId": "proj-1700000000000", "name": "A", "position": 0, "icon": "Inbox"},
        ],
        "notes": [
            {
                "id": "note-1",
                "sectionId": "sec-a",
                "title": "メモ1",
                "content": "本文1",
                "position": 0,
                "createdAt": "2025-01-02T00:00:00.000Z",
                "updatedAt": "2025-01-05T00:00:00.000Z",
            },
            {"id": "note-2", "sectionId": "sec-deleted", "title": "", "content": "迷子のメモ"},
        ],
        "prds": [
            {
                "id": "prd-1",
                "title": "PRD",
                "content": "v2 本文",
                "generationMode": "suggest",
                # 古いデータには detailLevel が無い
                "sourceNoteIds": ["note-1", "note-gone"],
                "facts": [
                    {"id": "f1", "text": "t", "sourceNoteId": "note-1", "sourceNoteTitle": "メモ1"},
                    {"id": "f2", "text": "t", "sourceNoteId": "note-gone"},
                ],
                "proposals": [{"id": "p1", "category": "c", "title": "t", "description": "d", "impact": "high"}],
                "openQuestions": [{"id": "q1", "question": "q", "context": "c", "urgency": "critical"}],
                "contradictions": [{"id": "c1", "issue": "i", "notesInvolved": ["note-1", "メモ1"]}],
                "version": 2,
                "versions": [
                    {
                        "id": "ver-1",
                        "prdDocumentId": "prd-1",
                        "versionNumber": 1,
                        "title": "PRD",
                        "content": "v1 本文",
                        "generationMode": "strict",
                        "detailLevel": "brief",
                        "sourceNoteIds": ["note-1"],
                        "facts": [],
                        "proposals": [],
                        "openQuestions": [],
                        "contradictions": [],
                        "createdAt": "2025-01-04T00:00:00.000Z",
                        "summary": "Version 1 (strict)",
                    }
                ],
                "createdAt": "2025-01-04T00:00:00.000Z",
                "updatedAt": "2025-01-06T00:00:00.000Z",
            }
        ],
        "preferences": {
            "id": "prefs-proj-1700000000000",
            "paneCount": 3,
            "panes": [{"id": "pane-0", "noteId": "note-2"}, {"id": "pane-1", "noteId": "note-gone"}],
            "activePaneId": "pane-0",
        },
    }


def test_import_remaps_ids_and_references(guest_client: TestClient) -> None:
    response = guest_client.post(IMPORT, json=legacy_payload())
    assert response.status_code == 201, response.text
    result = response.json()
    assert {k: result[k] for k in ["sections", "notes", "prds"]} == {"sections": 2, "notes": 2, "prds": 1}

    project_id = result["projectId"]
    project = next(p for p in guest_client.get("/api/projects").json() if p["id"] == project_id)
    assert project["name"] == "旧プロジェクト"
    assert project["createdAt"].startswith("2025-01-02T03:04:05.678")

    data = guest_client.get(f"/api/projects/{project_id}/data").json()
    sections = {s["name"]: s for s in data["sections"]}
    assert [s["name"] for s in data["sections"]] == ["A", "B"]
    notes = {n["title"] or n["content"]: n for n in data["notes"]}
    note1, note2 = notes["メモ1"], notes["迷子のメモ"]

    assert note1["sectionId"] == sections["A"]["id"]
    # 見つからないセクションを指していたメモは先頭のセクションへ
    assert note2["sectionId"] == sections["A"]["id"]
    assert note1["updatedAt"].startswith("2025-01-05")
    assert not any(n["id"].startswith("note-") for n in data["notes"])

    [prd] = data["prds"]
    assert prd["detailLevel"] == "standard"
    assert prd["version"] == 2
    assert prd["sourceNoteIds"] == [note1["id"]]
    assert prd["facts"] == [
        {"id": "f1", "text": "t", "sourceNoteId": note1["id"], "sourceNoteTitle": "メモ1"},
        {"id": "f2", "text": "t"},
    ]
    assert prd["contradictions"][0]["notesInvolved"] == [note1["id"], "メモ1"]
    [version] = prd["versions"]
    assert version["versionNumber"] == 1 and version["content"] == "v1 本文"
    assert version["sourceNoteIds"] == [note1["id"]] and version["detailLevel"] == "brief"

    prefs = data["preferences"]
    assert prefs["paneCount"] == 3
    assert prefs["panes"] == [{"id": "pane-0", "noteId": note2["id"]}, {"id": "pane-1"}]


def test_import_without_sections_uses_templates(guest_client: TestClient) -> None:
    payload = legacy_payload()
    payload["sections"] = []
    result = guest_client.post(IMPORT, json=payload).json()

    data = guest_client.get(f"/api/projects/{result['projectId']}/data").json()
    assert result["sections"] == len(data["sections"]) == 4
    assert {n["sectionId"] for n in data["notes"]} == {data["sections"][0]["id"]}


def test_import_minimal_project(guest_client: TestClient) -> None:
    response = guest_client.post(IMPORT, json={"project": {"id": "p", "name": "空"}})
    assert response.status_code == 201
    assert response.json()["notes"] == 0


def test_import_skips_duplicate_version_numbers(guest_client: TestClient) -> None:
    payload = legacy_payload()
    versions = payload["prds"][0]["versions"]
    versions.append({**versions[0], "content": "duplicate"})
    result = guest_client.post(IMPORT, json=payload).json()
    [prd] = guest_client.get(f"/api/projects/{result['projectId']}/data").json()["prds"]
    assert [v["content"] for v in prd["versions"]] == ["v1 本文"]


@pytest.mark.parametrize(
    "mutate",
    [
        lambda p: p["project"].pop("name"),
        lambda p: p["prds"][0].update(generationMode="unknown"),
        lambda p: p["notes"].append({"id": "n", "content": "x" * (config.MAX_STORED_NOTE_CHARS + 1)}),
        lambda p: p["preferences"].update(paneCount=9),
    ],
)
def test_import_rejects_invalid_data_without_partial_writes(guest_client: TestClient, mutate: Any) -> None:
    before = len(guest_client.get("/api/projects").json())
    payload = legacy_payload()
    mutate(payload)
    assert guest_client.post(IMPORT, json=payload).status_code == 422
    assert len(guest_client.get("/api/projects").json()) == before


def test_import_accepts_bodies_larger_than_normal_limit(guest_client: TestClient) -> None:
    payload = legacy_payload()
    payload["notes"] = [
        {"id": f"n{i}", "sectionId": "sec-a", "content": "x" * 90_000} for i in range(15)
    ]  # 約 1.35MB（通常の API は 1MB まで）
    response = guest_client.post(IMPORT, json=payload)
    assert response.status_code == 201
    assert response.json()["notes"] == 15


def test_import_requires_session(client: TestClient) -> None:
    assert client.post(IMPORT, json=legacy_payload()).status_code == 401
