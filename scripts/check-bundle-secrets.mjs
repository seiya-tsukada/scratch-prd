#!/usr/bin/env node
/**
 * フロントのビルド成果物（dist/）に秘密情報が含まれていないことを確かめる。`npm run build` の後に実行する。
 *   - VITE_ 以外の環境変数の値（.env とプロセスの環境変数から集める）
 *   - 秘密情報によくある形の文字列（DB 接続文字列・秘密鍵・API キー）
 * 見つかったら終了コード 1（Vercel のビルド・CI を失敗させる）。値そのものは表示しない。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
// サーバー側だけで使う環境変数（.env に無くても、プロセスにあれば検査する）
const SERVER_ONLY_ENV = [
  'DATABASE_URL',
  'DATABASE_URL_DIRECT',
  'SESSION_TOKEN_PEPPER',
  'GEMINI_API_KEY',
  'TURNSTILE_SECRET_KEY',
  'CRON_SECRET',
];
// 秘密ではない（短い・ありふれた）値は誤検知になるので除く
const MIN_SECRET_LENGTH = 8;
const NOT_SECRET = new Set(['true', 'false', 'MY_GEMINI_API_KEY', 'gemini-3.8-flash', 'http://localhost:3000']);

const PATTERNS = [
  { name: 'Postgres の接続文字列', regex: /postgres(?:ql)?:\/\/[^\s"'`]+@/ },
  { name: '秘密鍵', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Google API キー', regex: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'Supabase の service_role キー', regex: /"role"\s*:\s*"service_role"/ },
];

const parseEnvFile = (path) => {
  if (!existsSync(path)) return {};
  const entries = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    entries[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return entries;
};

const listFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });

if (!existsSync(DIST)) {
  console.error(`${DIST}/ がありません。先に npm run build を実行してください。`);
  process.exit(1);
}

const secrets = new Map();
const addSecret = (name, value) => {
  if (!name.startsWith('VITE_') && value && value.length >= MIN_SECRET_LENGTH && !NOT_SECRET.has(value)) {
    secrets.set(value, name);
  }
};
for (const [name, value] of Object.entries(parseEnvFile('.env'))) addSecret(name, value);
for (const name of SERVER_ONLY_ENV) addSecret(name, process.env[name]);

const problems = [];
for (const file of listFiles(DIST)) {
  const content = readFileSync(file, 'utf8');
  for (const [value, name] of secrets) {
    if (content.includes(value)) problems.push(`${file}: 環境変数 ${name} の値が含まれています`);
  }
  for (const { name, regex } of PATTERNS) {
    if (regex.test(content)) problems.push(`${file}: ${name}らしき文字列が含まれています`);
  }
}

if (problems.length > 0) {
  console.error('フロントのビルド成果物に秘密情報が含まれています:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`秘密情報の検査: 問題なし（${secrets.size} 個の値と ${PATTERNS.length} 種類のパターンを確認）`);
