"""他人のデータに一切アクセスできないこと。全エンドポイントで、他人の ID は 404 になりデータは変わらない"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from .test_workspace import PRD_BODY


def snapshot(client: TestClient) -> dict[str, Any]:
    body: dict[str, Any] = client.get("/api/workspace/bootstrap").json()
    return body


@pytest.fixture
def alice(guest_client: TestClient) -> dict[str, Any]:
    """被害者側（guest_client）のリソース ID"""
    data = snapshot(guest_client)
    return {
        "project": data["currentProjectId"],
        "sections": [s["id"] for s in data["data"]["sections"]],
        "section": data["data"]["sections"][0]["id"],
        "note": data["data"]["notes"][0]["id"],
        "prd": data["data"]["prds"][0]["id"],
    }


@pytest.fixture
def bob(other_guest_client: TestClient) -> dict[str, Any]:
    """攻撃者側（other_guest_client）のリソース ID"""
    data = snapshot(other_guest_client)
    return {"project": data["currentProjectId"], "note": data["data"]["notes"][0]["id"]}


ATTACKS: list[tuple[str, str, Any]] = [
    ("get", "/api/projects/{alice[project]}/data", None),
    ("patch", "/api/projects/{alice[project]}", {"name": "pwned"}),
    ("delete", "/api/projects/{alice[project]}", None),
    ("post", "/api/projects/{alice[project]}/sections", {"name": "pwned"}),
    ("put", "/api/projects/{alice[project]}/sections/order", "alice_sections"),
    ("patch", "/api/sections/{alice[section]}", {"name": "pwned"}),
    ("delete", "/api/sections/{alice[section]}", None),
    ("post", "/api/projects/{alice[project]}/notes", {"sectionId": "{alice[section]}"}),
    ("post", "/api/projects/{bob[project]}/notes", {"sectionId": "{alice[section]}"}),
    ("patch", "/api/notes/{alice[note]}", {"content": "pwned"}),
    ("patch", "/api/notes/{bob[note]}", {"sectionId": "{alice[section]}"}),
    ("delete", "/api/notes/{alice[note]}", None),
    ("post", "/api/projects/{alice[project]}/prds", PRD_BODY),
    ("put", "/api/prds/{alice[prd]}", PRD_BODY),
    ("delete", "/api/prds/{alice[prd]}", None),
    (
        "put",
        "/api/projects/{alice[project]}/preferences",
        {"paneCount": 1, "panes": [], "activePaneId": "pane-0"},
    ),
]


def fill(value: Any, ids: dict[str, Any]) -> Any:
    if isinstance(value, str):
        return value.format(**ids)
    if isinstance(value, dict):
        return {k: fill(v, ids) for k, v in value.items()}
    return value


@pytest.mark.parametrize(("method", "path", "body"), ATTACKS, ids=[f"{m} {p}" for m, p, _ in ATTACKS])
def test_other_users_resources_are_not_found(
    guest_client: TestClient,
    other_guest_client: TestClient,
    alice: dict[str, Any],
    bob: dict[str, Any],
    method: str,
    path: str,
    body: Any,
) -> None:
    ids = {"alice": alice, "bob": bob}
    before = snapshot(guest_client)
    payload = {"orderedIds": alice["sections"]} if body == "alice_sections" else fill(body, ids)

    response = other_guest_client.request(method, path.format(**ids), json=payload)

    assert response.status_code == 404, response.text
    assert response.json()["detail"] == {"code": "not_found"}
    assert snapshot(guest_client) == before


def test_listing_and_bootstrap_only_show_own_data(
    guest_client: TestClient, other_guest_client: TestClient, alice: dict[str, Any], bob: dict[str, Any]
) -> None:
    assert [p["id"] for p in other_guest_client.get("/api/projects").json()] == [bob["project"]]

    # 他人のプロジェクト ID を指定しても、自分の先頭プロジェクトになる
    body = other_guest_client.get("/api/workspace/bootstrap", params={"projectId": alice["project"]}).json()
    assert body["currentProjectId"] == bob["project"]
    assert alice["note"] not in {n["id"] for n in body["data"]["notes"]}


def test_two_guests_get_separate_data(guest_client: TestClient, other_guest_client: TestClient) -> None:
    a = snapshot(guest_client)
    b = snapshot(other_guest_client)
    assert a["currentProjectId"] != b["currentProjectId"]
    assert not {n["id"] for n in a["data"]["notes"]} & {n["id"] for n in b["data"]["notes"]}

    pid = a["currentProjectId"]
    section = a["data"]["sections"][0]["id"]
    guest_client.post(f"/api/projects/{pid}/notes", json={"sectionId": section, "content": "alice only"})
    assert "alice only" not in str(snapshot(other_guest_client))
