"""入力上限が Python（backend/app/config.py）と TypeScript（src/config/api.ts）で一致していること"""

from __future__ import annotations

import re

from backend.app import config

TS_API_CONFIG = config.REPO_ROOT / "src" / "config" / "api.ts"
TS_TAGS_CONFIG = config.REPO_ROOT / "src" / "config" / "tags.ts"


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
        "MAX_TITLE_CHARS": config.MAX_TITLE_CHARS,
        "MAX_PREVIOUS_ITEMS": config.MAX_PREVIOUS_ITEMS,
        "MAX_PREVIOUS_ITEM_CHARS": config.MAX_PREVIOUS_ITEM_CHARS,
    }


def test_tag_limits_and_colors_match_frontend() -> None:
    source = TS_TAGS_CONFIG.read_text(encoding="utf-8")
    block = re.search(r"export const TAG_LIMITS = \{(.*?)\}", source, re.S)
    assert block, "TAG_LIMITS が src/config/tags.ts に見つかりません"
    limits = {name: int(value.replace("_", "")) for name, value in re.findall(r"(\w+):\s*([\d_]+)", block.group(1))}
    assert limits == {
        "MAX_TAGS_PER_PROJECT": config.MAX_TAGS_PER_PROJECT,
        "MAX_TAGS_PER_NOTE": config.MAX_TAGS_PER_NOTE,
        "MAX_TAG_NAME_CHARS": config.MAX_TAG_NAME_CHARS,
    }

    colors = re.search(r"export const TAG_COLORS = \[(.*?)\]", source, re.S)
    assert colors, "TAG_COLORS が src/config/tags.ts に見つかりません"
    assert tuple(re.findall(r"'(\w+)'", colors.group(1))) == config.TAG_COLORS
