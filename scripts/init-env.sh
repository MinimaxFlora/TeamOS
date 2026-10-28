#!/bin/sh
# 生成/补齐 .env，并保证主密钥只生成一次。
# 不会覆盖已有的 TEAMOS_SECRET_KEY，也不会把密钥打印到日志。
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env 2>/dev/null || true
  echo "已创建 .env（来自 .env.example）"
fi

current=$(sed -n 's/^TEAMOS_SECRET_KEY=//p' .env | tail -n 1)
if [ -n "$current" ]; then
  echo "TEAMOS_SECRET_KEY 已存在，保持不变"
  exit 0
fi

if command -v openssl >/dev/null 2>&1; then
  key=$(openssl rand -hex 32)
elif command -v node >/dev/null 2>&1; then
  key=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")
else
  echo "需要 openssl 或 node 来生成主密钥" >&2
  exit 1
fi

tmp=$(mktemp)
awk -v key="$key" '
  BEGIN { done = 0 }
  /^TEAMOS_SECRET_KEY=/ { print "TEAMOS_SECRET_KEY=" key; done = 1; next }
  { print }
  END { if (!done) print "TEAMOS_SECRET_KEY=" key }
' .env > "$tmp"
mv "$tmp" .env
chmod 600 .env 2>/dev/null || true

echo "已生成新的 TEAMOS_SECRET_KEY（保存在 .env，权限 600）"
