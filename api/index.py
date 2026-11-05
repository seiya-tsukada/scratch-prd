"""Vercel Function のエントリポイント。/api/* はすべて vercel.json の rewrites でここに集まる。
本体は backend/app（FastAPI）。このファイルには処理を書かない"""

from backend.app.main import app

__all__ = ["app"]
