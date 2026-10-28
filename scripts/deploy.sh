#!/bin/sh
# 在 VPS 的 /opt/teamos 目录执行：拉取 GHCR 镜像、重建容器、等待健康检查。
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

if [ ! -f .env ]; then
  echo "缺少 .env，先执行 sh scripts/init-env.sh" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker 未安装，先执行 make vps-bootstrap" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker 守护进程不可用" >&2
  exit 1
fi

echo "拉取镜像…"
if ! docker compose pull; then
  echo
  echo "拉取失败。如果 GHCR 包还是私有的，请先登录：" >&2
  echo "  echo <PAT> | docker login ghcr.io -u <GitHub 用户名> --password-stdin" >&2
  echo "或在 GitHub 把 package 可见性改为 public。" >&2
  exit 1
fi

echo "启动 TeamOS（面板 + Hermes）…"
docker compose up -d --remove-orphans

echo "等待健康检查（最多 4 分钟）…"
i=0
while [ "$i" -lt 48 ]; do
  status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' teamos 2>/dev/null || echo missing)
  if [ "$status" = "healthy" ]; then
    break
  fi
  if [ "$status" = "unhealthy" ]; then
    echo "容器健康检查失败，最近日志：" >&2
    docker compose logs --tail=100 teamos >&2 || true
    exit 1
  fi
  i=$((i + 1))
  sleep 5
done

if [ "$status" != "healthy" ]; then
  echo "等待超时（当前状态：$status），最近日志：" >&2
  docker compose logs --tail=100 teamos >&2 || true
  exit 1
fi

# 清理 7 天前的旧镜像层，保留正在使用的镜像。
docker image prune -f --filter "until=168h" >/dev/null 2>&1 || true

echo
docker compose ps
echo
echo "TeamOS 已启动。"
ip=$(hostname -I 2>/dev/null | awk '{print $1}')
port=$(sed -n 's/^TEAMOS_PORT=//p' .env | tail -n 1)
echo "访问：http://${ip:-<服务器IP>}:${port:-8080}"
echo "第一次打开会进入初始化页，创建管理员账号；登录后到「设置 → 大模型」填写服务商和 API Key。"
