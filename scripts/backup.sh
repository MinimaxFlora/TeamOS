#!/bin/sh
# 备份 TeamOS 的 SQLite 数据与 Hermes 工作区。
# 先停容器，保证 SQLite / Hermes 状态一致，再打包两个持久化卷。
# 备份文件默认保留 14 天（BACKUP_KEEP_DAYS）。
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups
chmod 700 backups 2>/dev/null || true
OUT="backups/teamos-${STAMP}.tar.gz"
umask 077

echo "停止 TeamOS…"
docker compose stop teamos >/dev/null
started=0
restore_service() {
  if [ "$started" = "0" ]; then
    started=1
    echo "重新启动 TeamOS…"
    docker compose start teamos >/dev/null 2>&1 || true
  fi
}
trap restore_service EXIT INT TERM

echo "打包数据卷 → $OUT"
docker compose run --rm -T --no-deps teamos sh -c 'tar -czf - -C / data opt/data' > "$OUT"

# 简单校验：能列出归档内容且非空。
if [ ! -s "$OUT" ] || ! tar -tzf "$OUT" >/dev/null 2>&1; then
  rm -f "$OUT"
  echo "备份失败：归档为空或损坏" >&2
  exit 1
fi

restore_service
trap - EXIT INT TERM

find backups -name 'teamos-*.tar.gz' -type f -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true
echo "备份完成：$(du -h "$OUT" | awk '{print $1}')  $OUT"
echo "提示：把备份同步到另一台机器或对象存储；本机磁盘损坏时本地备份也会一起丢失。"
