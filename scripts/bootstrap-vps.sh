#!/bin/sh
# 在一台干净的 Debian/Ubuntu VPS 上初始化 Docker 与 swap。
# 只做系统层准备，不写入任何 TeamOS 密钥。
# 用法（本地）：make vps-bootstrap
# 用法（服务器）：sh scripts/bootstrap-vps.sh
set -eu

if [ "$(id -u)" != "0" ]; then
  echo "请用 root 运行（或 sudo sh scripts/bootstrap-vps.sh）" >&2
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "这个脚本目前只支持 Debian/Ubuntu（需要 apt-get）" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends ca-certificates curl

# 1.9GB 内存跑 Hermes + Chromium 不够，补 2GB swap（已存在则跳过）。
swap_total=$(awk '/^SwapTotal:/ { print $2 }' /proc/meminfo)
if [ "${swap_total:-0}" = "0" ] && [ ! -f /swapfile ]; then
  echo "未检测到 swap，创建 /swapfile (2G)…"
  if ! fallocate -l 2G /swapfile 2>/dev/null; then
    dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  fi
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-team-swap.conf
  sysctl -p /etc/sysctl.d/99-team-swap.conf >/dev/null
  echo "swap 已启用"
else
  echo "已检测到 swap，跳过"
fi

# 2. Docker（官方安装脚本会添加 docker compose 插件）。
if ! command -v docker >/dev/null 2>&1; then
  echo "安装 Docker…"
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh
else
  echo "Docker 已安装：$(docker --version)"
fi

systemctl enable --now docker
if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose 插件不可用，请先安装 docker-compose-plugin" >&2
  exit 1
fi

mkdir -p /opt/teamos/backups
chmod 700 /opt/teamos /opt/teamos/backups 2>/dev/null || true

echo
echo "系统准备完成："
echo "  Docker: $(docker --version)"
echo "  Compose: $(docker compose version --short 2>/dev/null || docker compose version)"
echo "  内存: $(free -h | awk '/^Mem:/ {print $2}')  交换: $(free -h | awk '/^Swap:/ {print $2}')"
echo "  目录: /opt/teamos"
echo
echo "下一步：在本地执行 make vps-deploy"
echo "如果云厂商有安全组，请只放行 22 与 8080；正式使用前请改用域名 + HTTPS。"
