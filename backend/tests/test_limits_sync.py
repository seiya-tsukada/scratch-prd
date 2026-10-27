"""入力上限が Python（backend/app/config.py）と TypeScript（src/config/api.ts）で一致していること"""

from __future__ import annotations

import re

from backend.app import config

TS_API_CONFIG = config.REPO_ROOT / "src" / "config" / "api.ts"


def ts_limits() -> dict[str, int]:
    source = TS_API_CONFIG.read_text(encoding="utf-8")
    block = re.search(r"export const AI_INPUT_LIMITS = \{(.*?)\}", source, re.S)
    assert block, "AI_INPUT_LIMITS が src/config/api.ts に見つかりません"
    return {name: int(value.replace("_", "")) for name, value in re.findall(r"(\w+):\s*([\d_]+)", block.group(1))}


def test_input_limits_match_frontend() -> None:
    assert ts_limits() == {
        "MAX_NOTES": config.MAX_NOTES,
        "MAX_NOTE_CONTENT_CHARS": config.MAX_NOTE_CONTENT_CHARS,
        "MAX_TOTAL_NOTE_CHARS": config.MAX_TOTAL_NOTE_CHARS,
        "MAX_ROUGH_NOTE_CHARS": config.MAX_ROUGH_NOTE_CHARS,
        "MAX_TITLE_CHARS": config.MAX_TITLE_CHARS,
        "MAX_PREVIOUS_ITEMS": config.MAX_PREVIOUS_ITEMS,
        "MAX_PREVIOUS_ITEM_CHARS": config.MAX_PREVIOUS_ITEM_CHARS,
    }
