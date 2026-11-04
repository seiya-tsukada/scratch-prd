# ローカル開発用の Vite（docker compose の web）。本番（Vercel）では使わない
FROM node:24-slim

WORKDIR /app
COPY package.json package-lock.json ./
# node_modules はコンテナ内（Linux 用）のものを使う。compose で名前付きボリュームに置き、ホストの node_modules と混ざらないようにする
RUN npm ci

EXPOSE 3000
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "3000", "--strictPort"]
