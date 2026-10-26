"""AI 機能: 殴り書きの整形と PRD 生成。AI が使えないときは内蔵ジェネレータで応答し、usedFallback で明示する。
ログイン（ゲスト可）必須。Gemini を呼ぶときだけ日次クォータを消費し、すべての生成を ai_generations に記録する"""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.app import config, security
from backend.app.db import Conn, Pool
from backend.app.models.ai import (
    FallbackReason,
    GeneratedPrd,
    GeneratePrdRequest,
    GeneratePrdResponse,
    StructuredNote,
    StructureRoughNoteRequest,
    StructureRoughNoteResponse,
)
from backend.app.services import fallbacks
from backend.app.services.ai_usage import AiGenerationRecord, record_ai_generation
from backend.app.services.gemini import GeminiClient, get_gemini_client
from backend.app.services.prompts import build_generate_prd_prompt, build_structure_rough_note_prompt
from backend.app.services.rate_limit import ai_quota_limit, consume_quota
from backend.app.sessions import CurrentUser, SessionUser

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(security.verify_origin)])

Gemini = Annotated[GeminiClient | None, Depends(get_gemini_client)]


class AiOutcome[T: BaseModel]:
    """Gemini 呼び出しの結果。result が None なら fallback_reason に理由が入る"""

    def __init__(self, result: T | None, fallback_reason: FallbackReason | None, error_type: str | None) -> None:
        self.result = result
        self.fallback_reason = fallback_reason
        self.error_type = error_type


async def ensure_quota(db: Conn, user: SessionUser, kind: config.AiKind) -> None:
    limit = ai_quota_limit(user.account_type, kind)
    if not await consume_quota(db, user.user_id, kind, limit):
        raise HTTPException(
            status_code=429,
            detail={
                "code": "quota_exceeded",
                "kind": kind,
                "limit": limit,
                "registeredLimit": ai_quota_limit("registered", kind),
                "canUpgradeByRegistering": user.is_guest,
            },
        )


async def call_gemini[T: BaseModel](
    gemini: GeminiClient | None,
    generate: Callable[[GeminiClient], Awaitable[T | None]],
    is_valid: Callable[[T], bool],
    log_label: str,
) -> AiOutcome[T]:
    if gemini is None:
        return AiOutcome(None, "no_api_key", "no_api_key")
    try:
        result = await generate(gemini)
    except Exception as e:
        logger.warning("%s: AI error (%s)", log_label, type(e).__name__)
        return AiOutcome(None, "ai_error", f"ai_error:{type(e).__name__}")
    if result is None or not is_valid(result):
        logger.warning("%s: invalid AI response", log_label)
        return AiOutcome(None, "invalid_response", "invalid_response")
    return AiOutcome(result, None, None)


def elapsed_ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)


@router.post("/structure-rough-note", response_model_exclude_none=True)
async def structure_rough_note(
    request: StructureRoughNoteRequest, user: CurrentUser, pool: Pool, gemini: Gemini
) -> StructureRoughNoteResponse:
    """殴り書きメモを PRD 風の構造化テキストに整形する"""
    if gemini is not None:
        async with pool.connection() as db:
            await ensure_quota(db, user, "structure")

    started = time.monotonic()
    outcome = await call_gemini(
        gemini,
        lambda g: g.generate(build_structure_rough_note_prompt(request), StructuredNote),
        lambda r: bool(r.structured_content),
        "structure-rough-note",
    )

    if outcome.result is not None:
        response = StructureRoughNoteResponse(
            structured_title=outcome.result.structured_title or request.title or fallbacks.DEFAULT_STRUCTURED_TITLE,
            structured_content=outcome.result.structured_content,
            used_fallback=False,
        )
    else:
        # キー未設定なら行を見出しに割り振り、AI 失敗時は作業を止めないよう最低限の構造で返す
        note = (
            fallbacks.structure_rough_note_locally(request.title, request.content)
            if outcome.fallback_reason == "no_api_key"
            else fallbacks.build_rough_note_error_fallback(request.title, request.content)
        )
        response = StructureRoughNoteResponse(
            **note.model_dump(), used_fallback=True, fallback_reason=outcome.fallback_reason
        )

    await record_ai_generation(
        pool,
        AiGenerationRecord(
            user_id=user.user_id,
            kind="structure",
            input_chars=len(request.content),
            latency_ms=elapsed_ms(started),
            used_fallback=response.used_fallback,
            error_type=outcome.error_type,
            model=gemini.model if gemini else None,
        ),
    )
    return response


@router.post("/generate-prd", response_model_exclude_none=True)
async def generate_prd(
    request: GeneratePrdRequest, user: CurrentUser, pool: Pool, gemini: Gemini
) -> GeneratePrdResponse:
    """複数メモから PRD を生成する"""
    if gemini is not None:
        async with pool.connection() as db:
            await ensure_quota(db, user, "prd")

    started = time.monotonic()
    outcome = await call_gemini(
        gemini,
        lambda g: g.generate(build_generate_prd_prompt(request), GeneratedPrd),
        lambda _: True,
        "generate-prd",
    )

    prd = outcome.result or fallbacks.generate_mock_prd(request)
    if outcome.result is not None and not prd.markdown:
        prd = prd.model_copy(update={"markdown": fallbacks.FALLBACK_PRD_MARKDOWN})
    response = GeneratePrdResponse(
        **prd.model_dump(),
        source_note_ids=[n.id for n in request.notes],
        used_fallback=outcome.fallback_reason is not None,
        fallback_reason=outcome.fallback_reason,
    )

    await record_ai_generation(
        pool,
        AiGenerationRecord(
            user_id=user.user_id,
            kind="prd",
            mode=request.mode,
            detail_level=request.detail_level,
            note_count=len(request.notes),
            input_chars=sum(len(n.content) for n in request.notes),
            latency_ms=elapsed_ms(started),
            used_fallback=response.used_fallback,
            error_type=outcome.error_type,
            model=gemini.model if gemini else None,
        ),
    )
    return response


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "time": datetime.now(UTC).isoformat()}
