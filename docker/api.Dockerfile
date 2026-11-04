# ローカル開発用の FastAPI（docker compose の api / migrate）。本番（Vercel）では使わない
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.10.7 /uv /uvx /bin/

# 仮想環境はソースのマウント先（/app）の外に置く。ホストの .venv（macOS 用）と混ざらないようにする
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-install-project

# ソースは compose でマウントする（--reload で反映）
EXPOSE 8000
CMD ["uv", "run", "--no-sync", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "backend"]
