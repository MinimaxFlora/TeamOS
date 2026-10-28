#!/bin/sh
# 从 backup.sh 生成的归档恢复 TeamOS。
# 用法：CONFIRM=yes sh scripts/restore.sh backups/teamos-YYYYmmdd-HHMMSS.tar.gz
# 恢复会覆盖 /data 与 /opt/data 中的现有数据，务必先确认归档正确。
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

FILE=${1:-}
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "用法：CONFIRM=yes sh scripts/restore.sh <备份文件>" >&2
  exit 1
fi
if [ "${CONFIRM:-}" != "yes" ]; then
  echo "恢复会覆盖当前数据。确认无误后执行：" >&2
  echo "  CONFIRM=yes sh scripts/restore.sh $FILE" >&2
  exit 1
fi
if ! tar -tzf "$FILE" >/dev/null 2>&1; then
  echo "归档损坏，无法读取：$FILE" >&2
  exit 1
fi

echo "停止 TeamOS…"
docker compose stop teamos >/dev/null
started=0
start_service() {
  if [ "$started" = "0" ]; then
    started=1
    echo "启动 TeamOS…"
    docker compose start teamos >/dev/null 2>&1 || true
  fi
}
trap start_service EXIT INT TERM

echo "恢复数据…"
# 同 backup.sh：镜像 ENTRYPOINT 是 s6，覆盖 entrypoint 才能让 tar 直接执行。
docker compose run --rm -T --no-deps --entrypoint sh teamos -c 'tar -xzf - -C /' < "$FILE"

start_service
trap - EXIT INT TERM
echo "恢复完成。请检查登录与模型设置是否正常。"
