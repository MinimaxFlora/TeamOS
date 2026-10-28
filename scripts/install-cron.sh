#!/bin/sh
# 安装每日备份 cron（服务器上执行，默认每天 03:17）。
set -eu

if [ "$(id -u)" != "0" ]; then
  echo "请用 root 运行" >&2
  exit 1
fi

DIR=${1:-/opt/teamos}
if [ ! -f "$DIR/scripts/backup.sh" ]; then
  echo "找不到 $DIR/scripts/backup.sh" >&2
  exit 1
fi
# cron 的重定向在 backup.sh 建目录之前执行，这里先建好。
mkdir -p "$DIR/backups"

cat > /etc/cron.d/teamos-backup <<EOF
# TeamOS daily backup. Output goes to $DIR/backups/backup.log
17 3 * * * root cd $DIR && BACKUP_KEEP_DAYS=14 sh scripts/backup.sh >> backups/backup.log 2>&1
EOF
chmod 644 /etc/cron.d/teamos-backup
echo "已安装 /etc/cron.d/teamos-backup（每天 03:17）"
