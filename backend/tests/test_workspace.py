"""Workspace API の CRUD・競合検知・版管理・上限"""

from __future__ import annotations

from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from backend.app import config


def bootstrap(client: TestClient, project_id: str | None = None) -> dict[str, Any]:
    params = {"projectId": project_id} if project_id else {}
    response = client.get("/api/workspace/bootstrap", params=params)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def create_project(client: TestClient, name: str = "New") -> dict[str, Any]:
    response = client.post("/api/projects", json={"name": name})
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


PRD_BODY: dict[str, Any] = {
    "title": "PRD",
    "content": "v1",
    "generationMode": "suggest",
    "detailLevel": "standard",
    "facts": [{"id": "f1", "text": "fact"}],
    "proposals": [],
    "openQuestions": [{"id": "q1", "question": "q", "context": "c", "urgency": "normal"}],
    "contradictions": [],
}


# ---------------------------------------------------------------- bootstrap


def test_bootstrap_returns_sample_for_new_guest(guest_client: TestClient) -> None:
    body = bootstrap(guest_client)

    assert len(body["projects"]) == 1
    assert body["currentProjectId"] == body["projects"][0]["id"]
    data = body["data"]
    assert len(data["sections"]) == 4
    assert [s["position"] for s in data["sections"]] == [0, 1, 2, 3]
    assert len(data["notes"]) == 5
    updated = [n["updatedAt"] for n in data["notes"]]
    assert updated == sorted(updated, reverse=True)
    assert len(data["prds"]) == 1 and data["prds"][0]["versions"] == []
    assert data["preferences"]["paneCount"] == 2
    assert {n["id"] for n in data["notes"]} >= {p["noteId"] for p in data["preferences"]["panes"] if p.get("noteId")}


def test_bootstrap_falls_back_to_first_project_for_unknown_id(guest_client: TestClient) -> None:
    body = bootstrap(guest_client, "00000000-0000-0000-0000-000000000000")
    assert body["currentProjectId"] == body["projects"][0]["id"]


def test_bootstrap_without_projects(guest_client: TestClient) -> None:
    project_id = bootstrap(guest_client)["currentProjectId"]
    guest_client.delete(f"/api/projects/{project_id}")
    # 値の無い項目は送らない（currentProjectId / data は省略される）
    assert bootstrap(guest_client) == {"projects": []}


# ---------------------------------------------------------------- projects


def test_create_project_uses_section_templates(guest_client: TestClient, db_admin: psycopg.Connection[Any]) -> None:
    db_admin.execute("update idea_ws.section_templates set name = 'Custom Inbox' where position = 0")
    try:
        project = create_project(guest_client, "  Trimmed  ")
    finally:
        db_admin.execute("update idea_ws.section_templates set name = 'Inbox (思いつき)' where position = 0")

    assert project["name"] == "Trimmed"
    data = guest_client.get(f"/api/projects/{project['id']}/data").json()
    assert [s["name"] for s in data["sections"]][0] == "Custom Inbox"
    assert len(data["sections"]) == 4
    assert data["notes"] == [] and data["prds"] == []
    assert data["preferences"]["panes"] == [{"id": f"pane-{i}"} for i in range(4)]

    # 新しいプロジェクトが先頭
    assert guest_client.get("/api/projects").json()[0]["id"] == project["id"]


def test_update_and_delete_project(guest_client: TestClient, db_admin: psycopg.Connection[Any]) -> None:
    project = create_project(guest_client)
    updated = guest_client.patch(f"/api/projects/{project['id']}", json={"name": "Renamed"}).json()
    assert updated["name"] == "Renamed" and updated["description"] == ""
    assert updated["updatedAt"] > project["updatedAt"]

    assert guest_client.delete(f"/api/projects/{project['id']}").status_code == 204
    assert db_admin.execute(
        "select count(*) from idea_ws.sections where project_id = %s", (project["id"],)
    ).fetchone() == (0,)
    assert guest_client.delete(f"/api/projects/{project['id']}").status_code == 404


@pytest.mark.parametrize("body", [{"name": ""}, {"name": "   "}, {"name": "x" * (config.MAX_NAME_CHARS + 1)}, {}])
def test_project_name_is_validated(guest_client: TestClient, body: dict[str, Any]) -> None:
    assert guest_client.post("/api/projects", json=body).status_code == 422


def test_project_limit(guest_client: TestClient, db_admin: psycopg.Connection[Any]) -> None:
    user_id = guest_client.get("/api/auth/me").json()["user"]["id"]
    db_admin.execute(
        "insert into idea_ws.projects (user_id, name) select %s, 'p' || g from generate_series(2, %s) g",
        (user_id, config.MAX_PROJECTS_PER_USER),
    )
    response = guest_client.post("/api/projects", json={"name": "one too many"})
    assert response.status_code == 422
    assert response.json()["detail"] == {
        "code": "limit_exceeded",
        "resource": "projects",
        "limit": config.MAX_PROJECTS_PER_USER,
    }


# ---------------------------------------------------------------- sections


def test_section_crud_and_reorder(guest_client: TestClient) -> None:
    project = create_project(guest_client)
    pid = project["id"]

    created = guest_client.post(f"/api/projects/{pid}/sections", json={"name": "Extra"})
    assert created.status_code == 201
    section = created.json()
    assert section["position"] == 4 and section["icon"] == "Folder"

    renamed = guest_client.patch(f"/api/sections/{section['id']}", json={"name": "Renamed"}).json()
    assert renamed["name"] == "Renamed"

    ids = [s["id"] for s in guest_client.get(f"/api/projects/{pid}/data").json()["sections"]]
    reordered = guest_client.put(f"/api/projects/{pid}/sections/order", json={"orderedIds": ids[::-1]}).json()
    assert [s["id"] for s in reordered] == ids[::-1]
    assert [s["position"] for s in reordered] == list(range(len(ids)))

    # 一部だけ・重複・余計な ID は受け付けない
    for bad in [ids[:2], [*ids[:-1], ids[0]], [*ids, "00000000-0000-0000-0000-000000000000"]]:
        assert guest_client.put(f"/api/projects/{pid}/sections/order", json={"orderedIds": bad}).status_code == 404


def test_deleting_section_deletes_its_notes(guest_client: TestClient) -> None:
    data = bootstrap(guest_client)["data"]
    section = data["sections"][0]
    in_section = [n for n in data["notes"] if n["sectionId"] == section["id"]]
    assert in_section

    assert guest_client.delete(f"/api/sections/{section['id']}").status_code == 204
    remaining = bootstrap(guest_client)["data"]["notes"]
    assert not {n["id"] for n in in_section} & {n["id"] for n in remaining}


# ---------------------------------------------------------------- notes


def test_note_crud_and_move(guest_client: TestClient) -> None:
    data = bootstrap(guest_client)["data"]
    pid = bootstrap(guest_client)["currentProjectId"]
    first, second = data["sections"][0]["id"], data["sections"][1]["id"]

    note = guest_client.post(f"/api/projects/{pid}/notes", json={"sectionId": first}).json()
    assert note["title"] == "" and note["content"] == "" and note["position"] == 0

    updated = guest_client.patch(f"/api/notes/{note['id']}", json={"content": "hello"}).json()
    assert updated["content"] == "hello" and updated["updatedAt"] > note["updatedAt"]

    moved = guest_client.patch(f"/api/notes/{note['id']}", json={"sectionId": second}).json()
    assert moved["sectionId"] == second and moved["content"] == "hello"

    assert guest_client.delete(f"/api/notes/{note['id']}").status_code == 204
    assert guest_client.patch(f"/api/notes/{note['id']}", json={"content": "x"}).status_code == 404


def test_note_cannot_be_put_in_another_projects_section(guest_client: TestClient) -> None:
    pid = bootstrap(guest_client)["currentProjectId"]
    note_id = bootstrap(guest_client)["data"]["notes"][0]["id"]
    other = create_project(guest_client)
    other_section = guest_client.get(f"/api/projects/{other['id']}/data").json()["sections"][0]["id"]

    assert guest_client.post(f"/api/projects/{pid}/notes", json={"sectionId": other_section}).status_code == 404
    assert guest_client.patch(f"/api/notes/{note_id}", json={"sectionId": other_section}).status_code == 404


def test_note_conflict_detection(guest_client: TestClient) -> None:
    note = bootstrap(guest_client)["data"]["notes"][0]

    first = guest_client.patch(
        f"/api/notes/{note['id']}", json={"content": "from tab A", "baseUpdatedAt": note["updatedAt"]}
    )
    assert first.status_code == 200

    # 古い updatedAt を基にした保存は 409 と最新のメモ
    stale = guest_client.patch(
        f"/api/notes/{note['id']}", json={"content": "from tab B", "baseUpdatedAt": note["updatedAt"]}
    )
    assert stale.status_code == 409
    detail = stale.json()["detail"]
    assert detail["code"] == "conflict"
    assert detail["note"]["content"] == "from tab A"
    assert detail["note"]["updatedAt"] == first.json()["updatedAt"]

    # 最新の updatedAt（マイクロ秒まで往復で保たれる）なら保存できる
    fresh = guest_client.patch(
        f"/api/notes/{note['id']}", json={"content": "from tab B", "baseUpdatedAt": first.json()["updatedAt"]}
    )
    assert fresh.status_code == 200

    # baseUpdatedAt を省略すれば上書き
    assert guest_client.patch(f"/api/notes/{note['id']}", json={"content": "force"}).status_code == 200


def test_note_size_limits(guest_client: TestClient) -> None:
    pid = bootstrap(guest_client)["currentProjectId"]
    section = bootstrap(guest_client)["data"]["sections"][0]["id"]
    long_content = "x" * (config.MAX_STORED_NOTE_CHARS + 1)
    response = guest_client.post(f"/api/projects/{pid}/notes", json={"sectionId": section, "content": long_content})
    assert response.status_code == 422


# ---------------------------------------------------------------- PRD


def test_prd_versions(guest_client: TestClient) -> None:
    data = bootstrap(guest_client)["data"]
    pid = bootstrap(guest_client)["currentProjectId"]
    note_ids = [n["id"] for n in data["notes"][:2]]

    created = guest_client.post(f"/api/projects/{pid}/prds", json={**PRD_BODY, "sourceNoteIds": note_ids})
    assert created.status_code == 201
    prd = created.json()
    assert prd["version"] == 1 and prd["versions"] == [] and prd["sourceNoteIds"] == note_ids
    assert prd["facts"] == [{"id": "f1", "text": "fact"}]

    v2 = guest_client.put(
        f"/api/prds/{prd['id']}", json={**PRD_BODY, "content": "v2", "generationMode": "expand"}
    ).json()
    v3 = guest_client.put(f"/api/prds/{prd['id']}", json={**PRD_BODY, "content": "v3"}).json()

    assert v2["version"] == 2 and v3["version"] == 3 and v3["content"] == "v3"
    assert [v["versionNumber"] for v in v3["versions"]] == [2, 1]
    assert [v["content"] for v in v3["versions"]] == ["v2", "v1"]
    assert v3["versions"][0]["summary"] == "Version 2 (expand)"
    assert v3["versions"][1]["sourceNoteIds"] == note_ids

    listed = guest_client.get(f"/api/projects/{pid}/data").json()["prds"]
    assert listed[0]["id"] == prd["id"] and len(listed[0]["versions"]) == 2

    assert guest_client.delete(f"/api/prds/{prd['id']}").status_code == 204
    assert guest_client.put(f"/api/prds/{prd['id']}", json=PRD_BODY).status_code == 404


def test_prd_validation(guest_client: TestClient) -> None:
    pid = bootstrap(guest_client)["currentProjectId"]
    for body in [{**PRD_BODY, "generationMode": "x"}, {**PRD_BODY, "content": "x" * (config.MAX_STORED_PRD_CHARS + 1)}]:
        assert guest_client.post(f"/api/projects/{pid}/prds", json=body).status_code == 422


# ---------------------------------------------------------------- preferences


def test_preferences_upsert(guest_client: TestClient) -> None:
    project = create_project(guest_client)
    pid = project["id"]
    body = {"paneCount": 3, "panes": [{"id": "pane-0", "noteId": None}], "activePaneId": "pane-0"}

    saved = guest_client.put(f"/api/projects/{pid}/preferences", json=body).json()
    assert saved["paneCount"] == 3 and saved["id"]
    again = guest_client.put(f"/api/projects/{pid}/preferences", json={**body, "paneCount": 1}).json()
    assert again["id"] == saved["id"] and again["paneCount"] == 1
    assert guest_client.get(f"/api/projects/{pid}/data").json()["preferences"]["paneCount"] == 1

    assert guest_client.put(f"/api/projects/{pid}/preferences", json={**body, "paneCount": 5}).status_code == 422


# ---------------------------------------------------------------- 認証・Origin


@pytest.mark.parametrize(
    ("method", "path"),
    [("get", "/api/workspace/bootstrap"), ("get", "/api/projects"), ("post", "/api/projects")],
)
def test_workspace_requires_session(client: TestClient, method: str, path: str) -> None:
    response = client.request(method, path, json={"name": "x"} if method == "post" else None)
    assert response.status_code == 401


def test_workspace_writes_require_origin(guest_client: TestClient) -> None:
    guest_client.headers.pop("Origin")
    assert guest_client.post("/api/projects", json={"name": "x"}).status_code == 403
