"""MOCK_BACKEND=true のときだけ使う API。DB に接続せず、固定のサンプル（fixture.json）を返す。

- ログイン中ユーザー・ワークスペースは常に同じゲストとサンプルのプロジェクト（初回の案内は済み扱い）
- AI は Gemini を呼ばず、内蔵ジェネレータで応答する（usedFallback: true で画面に明示される）
- 保存・変更は受け付けず 503（code: mock_mode）。計測イベント・ログアウト・Cron は何もせず成功を返す

fixture.json は、ローカル DB で新規ゲストを作り GET /api/auth/guest と /api/workspace/bootstrap の
レスポンスを保存したもの（onboardingDone だけ true に変更）"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request

from backend.app import security
from backend.app.models.ai import (
    GeneratePrdRequest,
    GeneratePrdResponse,
)
from backend.app.models.auth import MeResponse
from backend.app.models.workspace import Bootstrap, Project, ProjectData
from backend.app.services import fallbacks

FIXTURE_PATH = Path(__file__).with_name("fixture.json")

router = APIRouter(dependencies=[Depends(security.verify_origin)])


@lru_cache
def _fixture() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return data


def _me() -> MeResponse:
    return MeResponse.model_validate(_fixture()["me"])


def _bootstrap() -> Bootstrap:
    return Bootstrap.model_validate(_fixture()["bootstrap"])


def _read_only() -> HTTPException:
    return HTTPException(status_code=503, detail={"code": "mock_mode"})


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "mode": "mock", "time": datetime.now(UTC).isoformat()}


@router.get("/auth/me", response_model_exclude_none=True)
async def me() -> MeResponse:
    return _me()


@router.post("/auth/guest", response_model_exclude_none=True)
async def create_guest() -> MeResponse:
    return _me()


@router.post("/auth/logout", status_code=204)
async def logout() -> None:
    return None


@router.post("/events", status_code=204)
async def post_event() -> None:
    return None


@router.get("/cron/cleanup")
async def cleanup() -> dict[str, int]:
    return {}


@router.get("/workspace/bootstrap", response_model_exclude_none=True)
async def bootstrap(project_id: UUID | None = None) -> Bootstrap:
    data = _bootstrap()
    if project_id is not None and project_id != data.current_project_id:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    return data


@router.get("/projects")
async def list_projects() -> list[Project]:
    return _bootstrap().projects


@router.get("/projects/{project_id}/data", response_model_exclude_none=True)
async def project_data(project_id: UUID) -> ProjectData:
    data = _bootstrap()
    if project_id != data.current_project_id or data.data is None:
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    return data.data


@router.post("/generate-prd", response_model_exclude_none=True)
async def generate_prd(request: GeneratePrdRequest) -> GeneratePrdResponse:
    prd = fallbacks.generate_mock_prd(request)
    return GeneratePrdResponse(
        **prd.model_dump(),
        source_note_ids=[n.id for n in request.notes],
        used_fallback=True,
        fallback_reason="no_api_key",
    )


# 上記以外: 読み取りは 404、保存・変更は 503（DB が無いため）
@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def unsupported(path: str, request: Request) -> None:
    if request.method == "GET":
        raise HTTPException(status_code=404, detail="Not Found")
    raise _read_only()
