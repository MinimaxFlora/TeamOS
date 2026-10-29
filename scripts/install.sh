#!/bin/sh
# 在全新的 Debian/Ubuntu 服务器上一条命令完成部署（不需要本地 SSH 密钥）：
#   curl -fsSL https://raw.githubusercontent.com/MinimaxFlora/TeamOS/main/scripts/install.sh | sh
# 可重复执行：已部署时等于 git pull + 重新拉起容器，数据保留在 Docker 卷里。
set -eu

REPO_URL=${TEAMOS_REPO_URL:-https://github.com/MinimaxFlora/TeamOS.git}
DIR=${TEAMOS_DIR:-/opt/teamos}

if [ "$(id -u)" != "0" ]; then
  echo "请用 root 运行（或 sudo sh install.sh）" >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git ca-certificates curl
fi

if [ -d "$DIR/.git" ]; then
  echo "更新代码：$DIR"
  git -C "$DIR" pull --ff-only
elif [ -f "$DIR/docker-compose.yml" ]; then
  # 早期用 make vps-deploy 上传的目录没有 .git：接管它，保留 .env 与 backups。
  echo "接管已有部署目录：$DIR"
  git -C "$DIR" init -q
  git -C "$DIR" remote remove origin 2>/dev/null || true
  git -C "$DIR" remote add origin "$REPO_URL"
  git -C "$DIR" fetch --depth 1 origin main
  git -C "$DIR" checkout -f -B main FETCH_HEAD
else
  echo "下载代码到 $DIR"
  mkdir -p "$DIR"
  git clone --depth 1 "$REPO_URL" "$DIR"
fi

cd "$DIR"
# 系统层准备（Docker、2G swap）；已安装时脚本会跳过。
sh scripts/bootstrap-vps.sh
# 生成 .env 与一次性主密钥；已有主密钥时保持不变。
sh scripts/init-env.sh
# 拉镜像、重建容器、等待健康检查。
sh scripts/deploy.sh
