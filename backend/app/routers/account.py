"""アカウント設定: 表示名・パスワードの変更、アカウント（ゲストならこのブラウザのデータ）の削除"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from backend.app import config, security
from backend.app.db import Db
from backend.app.models.auth import (
    AccountDelete,
    AccountUpdate,
    MeResponse,
    MeUser,
    OnboardingResult,
    PasswordChange,
)
from backend.app.services import accounts
from backend.app.services.events import record_event
from backend.app.services.rate_limit import enforce_rate_limit
from backend.app.sessions import CurrentUser, SessionUser

router = APIRouter(prefix="/account", dependencies=[Depends(security.verify_origin)])


async def require_password(db: Db, request: Request, user: SessionUser, password: str | None) -> None:
    """正規ユーザーの重要な操作は、パスワードの再入力で本人確認する"""
    await enforce_rate_limit(db, "login_ip", security.client_ip(request) or "unknown", config.LOGIN_RATE_LIMIT_PER_IP)
    if not password or not await accounts.verify_user_password(db, user.user_id, password):
        raise HTTPException(status_code=403, detail={"code": "invalid_password"})


@router.patch("", response_model_exclude_none=True)
async def update_account(body: AccountUpdate, db: Db, user: CurrentUser) -> MeResponse:
    await accounts.update_display_name(db, user.user_id, body.display_name)
    return MeResponse(
        user=MeUser(
            id=user.user_id,
            is_guest=user.is_guest,
            email=user.email,
            display_name=body.display_name,
            onboarding_done=user.onboarding_done,
        )
    )


@router.post("/onboarding", status_code=204)
async def finish_onboarding(body: OnboardingResult, db: Db, user: CurrentUser) -> None:
    """初回の案内を終えた（completed）・飛ばした（skipped）ことを記録する。2 回目以降は何もしない"""
    if await accounts.finish_onboarding(db, user.user_id, body.result):
        await record_event(db, user.user_id, f"onboarding_{body.result}", session_id=user.session_id)


@router.post("/password", status_code=204)
async def change_password(body: PasswordChange, request: Request, db: Db, user: CurrentUser) -> None:
    """パスワードを変更し、この端末以外のセッションをすべて失効させる"""
    if user.is_guest:
        raise HTTPException(status_code=409, detail={"code": "not_registered"})
    await require_password(db, request, user, body.current_password)
    async with db.transaction():
        await accounts.set_password(db, user.user_id, body.new_password)
        await accounts.revoke_other_sessions(db, user.user_id, user.session_id)


@router.delete("", status_code=204)
async def delete_account(body: AccountDelete, request: Request, response: Response, db: Db, user: CurrentUser) -> None:
    """アカウントとすべてのデータを削除する。ゲストの場合はこのブラウザのデータを削除する"""
    if not user.is_guest:
        await require_password(db, request, user, body.password)
    await accounts.delete_user(db, user.user_id)
    security.clear_session_cookie(response)
