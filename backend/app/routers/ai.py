"""AI 機能: 殴り書きの整形と PRD 生成。AI が使えないときは内蔵ジェネレータで応答し、usedFallback で明示する"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends

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
from backend.app.services.gemini import GeminiClient, get_gemini_client
from backend.app.services.prompts import build_generate_prd_prompt, build_structure_rough_note_prompt

logger = logging.getLogger(__name__)

router = APIRouter()

Gemini = Annotated[GeminiClient | None, Depends(get_gemini_client)]


@router.post("/structure-rough-note", response_model_exclude_none=True)
async def structure_rough_note(request: StructureRoughNoteRequest, gemini: Gemini) -> StructureRoughNoteResponse:
    """殴り書きメモを PRD 風の構造化テキストに整形する"""

    def fallback(note: StructuredNote, reason: FallbackReason) -> StructureRoughNoteResponse:
        return StructureRoughNoteResponse(**note.model_dump(), used_fallback=True, fallback_reason=reason)

    if gemini is None:
        return fallback(fallbacks.structure_rough_note_locally(request.title, request.content), "no_api_key")

    # ユーザーの作業を止めないよう、AI が失敗しても最低限の構造で返す
    error_fallback = fallbacks.build_rough_note_error_fallback(request.title, request.content)
    try:
        result = await gemini.generate(build_structure_rough_note_prompt(request), StructuredNote)
    except Exception as e:
        logger.warning("structure-rough-note: AI error (%s)", type(e).__name__)
        return fallback(error_fallback, "ai_error")

    if result is None or not result.structured_content:
        logger.warning("structure-rough-note: invalid AI response")
        return fallback(error_fallback, "invalid_response")

    return StructureRoughNoteResponse(
        structured_title=result.structured_title or request.title or fallbacks.DEFAULT_STRUCTURED_TITLE,
        structured_content=result.structured_content,
        used_fallback=False,
    )


@router.post("/generate-prd", response_model_exclude_none=True)
async def generate_prd(request: GeneratePrdRequest, gemini: Gemini) -> GeneratePrdResponse:
    """複数メモから PRD を生成する"""
    source_note_ids = [n.id for n in request.notes]

    def respond(prd: GeneratedPrd, reason: FallbackReason | None) -> GeneratePrdResponse:
        return GeneratePrdResponse(
            **prd.model_dump(),
            source_note_ids=source_note_ids,
            used_fallback=reason is not None,
            fallback_reason=reason,
        )

    if gemini is None:
        return respond(fallbacks.generate_mock_prd(request), "no_api_key")

    try:
        result = await gemini.generate(build_generate_prd_prompt(request), GeneratedPrd)
    except Exception as e:
        logger.warning("generate-prd: AI error (%s)", type(e).__name__)
        return respond(fallbacks.generate_mock_prd(request), "ai_error")

    if result is None:
        logger.warning("generate-prd: invalid AI response")
        return respond(fallbacks.generate_mock_prd(request), "invalid_response")

    if not result.markdown:
        result = result.model_copy(update={"markdown": fallbacks.FALLBACK_PRD_MARKDOWN})
    return respond(result, None)


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "time": datetime.now(UTC).isoformat()}
