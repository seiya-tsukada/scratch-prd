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
    assert result == {"projectId": result["projectId"], "notes": 2, "prds": 1}

    project_id = result["projectId"]
    project = next(p for p in guest_client.get("/api/projects").json() if p["id"] == project_id)
    assert project["name"] == "旧プロジェクト"
    assert project["createdAt"].startswith("2025-01-02T03:04:05.678")

    data = guest_client.get(f"/api/projects/{project_id}/data").json()
    # セクションは取り込まない（見つからないセクションを指していたメモもメモとして取り込む）
    assert "sections" not in data
    assert all("sectionId" not in n for n in data["notes"])
    notes = {n["title"] or n["content"]: n for n in data["notes"]}
    note1, note2 = notes["メモ1"], notes["迷子のメモ"]

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


def test_import_converts_prd_section_notes_into_prds(guest_client: TestClient) -> None:
    payload = legacy_payload()
    payload["sections"] += [
        {"id": "sec-prd", "name": "PRD (生成された仕様書)", "position": 2},
        {"id": "sec-prd-lower", "name": "  prd メモ", "position": 3},
        {"id": "sec-not-prd", "name": "My PRD ideas", "position": 4},
    ]
    payload["notes"] += [
        {
            "id": "note-prd",
            "sectionId": "sec-prd",
            "title": "旧仕様書",
            "content": "# 見出し\n本文",
            "createdAt": "2025-01-02T00:00:00.000Z",
            "updatedAt": "2025-01-07T00:00:00.000Z",
        },
        {"id": "note-prd-heading", "sectionId": "sec-prd-lower", "title": " ", "content": "## 本文の見出し\n続き"},
        {"id": "note-prd-empty", "sectionId": "sec-prd", "title": "", "content": ""},
        {"id": "note-not-prd", "sectionId": "sec-not-prd", "title": "PRD の素材", "content": "x"},
    ]
    # PRD に変換したメモはペインから外れる
    payload["preferences"]["panes"].append({"id": "pane-2", "noteId": "note-prd"})
    payload["prds"][0]["sourceNoteIds"].append("note-prd")

    response = guest_client.post(IMPORT, json=payload)
    assert response.status_code == 201, response.text
    result = response.json()
    assert (result["notes"], result["prds"]) == (3, 4)

    data = guest_client.get(f"/api/projects/{result['projectId']}/data").json()
    assert {n["title"] or n["content"] for n in data["notes"]} == {"メモ1", "迷子のメモ", "PRD の素材"}

    converted = {p["title"]: p for p in data["prds"] if p["generationMode"] == "unknown"}
    assert set(converted) == {"旧仕様書", "本文の見出し", "無題のPRD"}
    prd = converted["旧仕様書"]
    assert prd["content"] == "# 見出し\n本文"
    assert prd["sourceNoteIds"] == [] and prd["versions"] == [] and prd["version"] == 1
    assert prd["detailLevel"] == "standard"
    assert prd["createdAt"].startswith("2025-01-02") and prd["updatedAt"].startswith("2025-01-07")

    # 通常の PRD の参照は、取り込んだメモだけに書き換わる
    [original] = [p for p in data["prds"] if p["generationMode"] != "unknown"]
    note1 = next(n for n in data["notes"] if n["title"] == "メモ1")
    assert original["sourceNoteIds"] == [note1["id"]]
    assert data["preferences"]["panes"][2] == {"id": "pane-2"}


def test_import_prd_title_from_long_first_line_is_truncated(guest_client: TestClient) -> None:
    payload = legacy_payload()
    payload["sections"].append({"id": "sec-prd", "name": "PRD", "position": 2})
    # タイトルが空なら本文の 1 行目（タイトルの上限より長くてもよい）を切り詰めて使う
    payload["notes"].append({"id": "note-prd", "sectionId": "sec-prd", "title": "", "content": "# " + "あ" * 300})
    response = guest_client.post(IMPORT, json=payload)
    assert response.status_code == 201, response.text
    result = response.json()

    prds = guest_client.get(f"/api/projects/{result['projectId']}/prds").json()
    [converted] = [p for p in prds if p["generationMode"] == "unknown"]
    assert converted["title"] == "あ" * config.MAX_NAME_CHARS


def test_import_without_sections_keeps_all_notes(guest_client: TestClient) -> None:
    payload = legacy_payload()
    del payload["sections"]
    result = guest_client.post(IMPORT, json=payload).json()

    assert (result["notes"], result["prds"]) == (2, 1)
    data = guest_client.get(f"/api/projects/{result['projectId']}/data").json()
    assert len(data["notes"]) == 2


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
        lambda p: p["prds"][0].update(generationMode="creative"),
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
