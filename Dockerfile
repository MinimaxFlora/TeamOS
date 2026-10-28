# syntax=docker/dockerfile:1.7
#
# TeamOS = 前端面板 + Node API + Hermes Agent，同一个镜像、同一个容器。
# 基础镜像已经包含 Python / Hermes / Playwright 依赖，这里只补 Node 运行时，
# 再由 Node 进程（PID 1 下的主程序）负责拉起并守护 Hermes Gateway。
#
ARG HERMES_IMAGE=nousresearch/hermes-agent:v0.22.5

# ---------- 构建前端 ----------
FROM node:24-bookworm-slim AS web

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public

RUN npm run build

# ---------- 运行镜像 ----------
FROM ${HERMES_IMAGE}

SHELL ["/bin/sh", "-c"]
USER root

# 官方 Node 二进制基于 glibc，和 Debian trixie 基础镜像兼容。
# 不通过 apt/nodesource，避免把系统 Node 或额外仓库带进镜像。
ARG NODE_VERSION=24.22.1
ARG TARGETARCH=amd64
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) node_arch="x64" ;; \
      arm64) node_arch="arm64" ;; \
      *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    cd /tmp; \
    curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"; \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o SHASUMS256.txt; \
    grep "  node-v${NODE_VERSION}-linux-${node_arch}.tar.xz$" SHASUMS256.txt | sha256sum -c -; \
    tar -xJf "node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" -C /usr/local --strip-components=1 --no-same-owner; \
    rm -f "node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" SHASUMS256.txt; \
    node --version; \
    npm --version

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    PUBLIC_DIR=/app/dist \
    HERMES_AUTO_START=true \
    HERMES_HOME=/opt/data \
    HERMES_BIN=/opt/hermes/.venv/bin/hermes \
    HERMES_BASE_URL=http://127.0.0.1:8642 \
    API_SERVER_HOST=127.0.0.1 \
    API_SERVER_PORT=8642 \
    HERMES_ALLOW_ROOT_GATEWAY=1 \
    HERMES_GATEWAY_NO_SUPERVISE=1 \
    SESSION_DAYS=14 \
    TRUST_PROXY=false \
    COOKIE_SECURE=false

WORKDIR /app
COPY --from=web /app/dist ./dist
COPY server ./server

# Docker 命名卷第一次创建时会继承这个目录的属主。
# 入口脚本会把主进程降权到 hermes（UID 10000），所以数据目录必须可写。
RUN mkdir -p /data && chown -R hermes:hermes /data

# 只有面板端口对外；Hermes API 只监听容器内的 127.0.0.1:8642。
EXPOSE 8080
VOLUME ["/data", "/opt/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 基础镜像的 ENTRYPOINT 会先完成 Hermes 的 s6/卷初始化，然后把命令降权执行。
# node 在 PATH 中，因此这里会直接以 hermes 用户运行 TeamOS 服务端。
CMD ["node", "server/index.mjs"]
