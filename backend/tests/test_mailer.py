"""メール送信（Resend）。外部には送らず、httpx の通信を置き換えて確かめる"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx
import pytest

from backend.app import config
from backend.app.services import mailer

# conftest の outbox が mailer.send_email を置き換える前の本物
REAL_SEND_EMAIL = mailer.send_email


@pytest.fixture
def settings_env(monkeypatch: pytest.MonkeyPatch) -> Any:
    def apply(**env: str | None) -> None:
        for key, value in env.items():
            if value is None:
                monkeypatch.delenv(key, raising=False)
            else:
                monkeypatch.setenv(key, value)
        config.get_settings.cache_clear()

    yield apply
    config.get_settings.cache_clear()


@pytest.fixture
def requests(monkeypatch: pytest.MonkeyPatch) -> list[httpx.Request]:
    sent: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return httpx.Response(200, json={"id": "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"})

    real_client = httpx.AsyncClient

    def client(**kwargs: Any) -> httpx.AsyncClient:
        return real_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client)
    return sent


def send() -> None:
    asyncio.run(REAL_SEND_EMAIL("alice@example.com", "件名", "本文 123456"))


def test_local_only_logs(settings_env: Any, requests: list[httpx.Request], caplog: pytest.LogCaptureFixture) -> None:
    settings_env(VERCEL_ENV=None, RESEND_API_KEY="re_test")
    with caplog.at_level(logging.WARNING):
        send()
    assert requests == []
    assert "123456" in caplog.text


def test_sends_with_resend(settings_env: Any, requests: list[httpx.Request]) -> None:
    settings_env(VERCEL_ENV="preview", RESEND_API_KEY="re_test", MAIL_FROM="Scratch prd <info@example.com>")
    send()
    assert len(requests) == 1
    request = requests[0]
    assert str(request.url) == config.RESEND_API_URL
    assert request.headers["authorization"] == "Bearer re_test"
    assert request.headers["idempotency-key"]
    assert json.loads(request.content) == {
        "from": "Scratch prd <info@example.com>",
        "to": ["alice@example.com"],
        "subject": "件名",
        "text": "本文 123456",
    }


@pytest.mark.parametrize("mail_from", [None, "", "  "])
def test_missing_mail_from_outside_local_is_an_error(
    settings_env: Any, requests: list[httpx.Request], mail_from: str | None
) -> None:
    settings_env(VERCEL_ENV="preview", RESEND_API_KEY="re_test", MAIL_FROM=mail_from)
    with pytest.raises(mailer.MailError):
        send()
    assert requests == []


@pytest.mark.parametrize("key", [None, "", "  "])
def test_missing_key_outside_local_is_an_error(
    settings_env: Any, requests: list[httpx.Request], key: str | None
) -> None:
    settings_env(VERCEL_ENV="preview", RESEND_API_KEY=key)
    with pytest.raises(mailer.MailError):
        send()
    assert requests == []


def test_resend_error_is_an_error(settings_env: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    settings_env(VERCEL_ENV="preview", RESEND_API_KEY="re_test", MAIL_FROM="Scratch prd <info@example.com>")
    real_client = httpx.AsyncClient

    def client(**kwargs: Any) -> httpx.AsyncClient:
        transport = httpx.MockTransport(lambda _r: httpx.Response(403, json={"message": "domain is not verified"}))
        return real_client(transport=transport, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client)
    with pytest.raises(mailer.MailError):
        send()


def test_sends_html_when_given(settings_env: Any, requests: list[httpx.Request]) -> None:
    settings_env(VERCEL_ENV="preview", RESEND_API_KEY="re_test", MAIL_FROM="Scratch prd <info@example.com>")
    asyncio.run(REAL_SEND_EMAIL("alice@example.com", "件名", "本文", "<p>本文</p>"))
    body = json.loads(requests[0].content)
    assert body["text"] == "本文"
    assert body["html"] == "<p>本文</p>"


def test_verification_mail_format() -> None:
    from backend.app.services import email_codes

    subject, text, html_body = email_codes.build_mail("a<b>@example.com", "register", "473270")
    assert subject == f"【{config.APP_NAME}】確認コード: 473270"
    assert "a<b> さん、" in text
    assert "    473270\n" in text
    assert "a&lt;b&gt; さん、" in html_body  # 宛名はエスケープする
    assert "473270" in html_body
    _, login_text, _ = email_codes.build_mail("bob@example.com", "login", "000123")
    assert "ログイン" in login_text
