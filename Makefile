SHELL := /bin/sh
.DEFAULT_GOAL := help

# 本地 .env（Git 忽略）里的值优先；没有 .env 时用这里的默认值。
-include .env

TEAMOS_IMAGE ?= ghcr.io/minimaxflora/teamos:latest
HERMES_IMAGE ?= nousresearch/hermes-agent:v0.22.5
NODE_VERSION ?= 24.22.1
TEAMOS_PORT ?= 8080

VPS_HOST ?=
VPS_USER ?= root
VPS_DIR ?= /opt/teamos
SSH_KEY ?=
GHCR_USER ?=
GHCR_TOKEN ?=
VPS ?= $(VPS_USER)@$(VPS_HOST)

DOMAIN ?=
COMPOSE_TLS := docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml

SSH_OPTS ?= -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new
ifneq ($(strip $(SSH_KEY)),)
SSH := ssh $(SSH_OPTS) -i $(SSH_KEY)
SCP := scp -i $(SSH_KEY)
else
SSH := ssh $(SSH_OPTS)
SCP := scp
endif

.PHONY: help env check-env check-vps check-docker build push pull up dev-up down restart logs ps health status shell \
	backup restore tls-up tls-down vps-bootstrap vps-login vps-deploy deploy vps-logs vps-status vps-backup \
	vps-backup-cron vps-download-backup vps-tls-up vps-ssh clean

help: ## 显示所有命令
	@printf '\nTeamOS 部署命令\n\n'
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@printf '\n首次部署：make env → make vps-bootstrap → make vps-login → make deploy\n\n'

env: ## 生成 .env 和主密钥（只生成一次）
	@sh scripts/init-env.sh

check-env:
	@test -f .env || (echo "缺少 .env，请先执行 make env" >&2; exit 1)

check-vps:
	@test -n "$(VPS_HOST)" || (echo "请先在 .env 设置 VPS_HOST（服务器 IP 或域名）" >&2; exit 1)

check-docker:
	@command -v docker >/dev/null 2>&1 || (echo "本机没有 docker；在服务器上部署无需本机 Docker，但 make build/up 需要" >&2; exit 1)

build: check-docker ## 本机构建镜像（tag: teamos:local）
	@docker build \
		--build-arg HERMES_IMAGE=$(HERMES_IMAGE) \
		--build-arg NODE_VERSION=$(NODE_VERSION) \
		-t teamos:local .

push: check-docker ## 把本机构建推送到 GHCR
	@test -n "$(TEAMOS_IMAGE)" || (echo "TEAMOS_IMAGE 为空" >&2; exit 1)
	docker tag teamos:local $(TEAMOS_IMAGE)
	docker push $(TEAMOS_IMAGE)

pull: check-env check-docker ## 拉取最新镜像
	docker compose pull

up: check-env check-docker ## 在本机启动（使用 .env 配置）
	docker compose up -d --remove-orphans

dev-up: check-env check-docker ## 本机从源码构建并启动
	docker compose up -d --build --remove-orphans

down: check-env check-docker ## 停止并删除容器（保留数据卷）
	docker compose down

restart: check-env check-docker ## 重启容器
	docker compose restart teamos

logs: check-env check-docker ## 跟踪日志
	docker compose logs -f --tail=200 teamos

ps: check-env check-docker ## 查看容器状态
	docker compose ps

health: ## 查看健康检查（本机）
	@curl -fsS "http://127.0.0.1:$(TEAMOS_PORT)/api/health" || (echo "健康检查失败" >&2; exit 1)

status: check-env check-docker ## 状态 + 健康检查
	@docker compose ps
	@docker inspect --format 'health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' teamos 2>/dev/null || true
	@curl -fsS "http://127.0.0.1:$(TEAMOS_PORT)/api/health" 2>/dev/null || true
	@echo

shell: check-env check-docker ## 进入容器 shell
	docker compose exec teamos sh

backup: check-env check-docker ## 本机备份数据卷（短暂停机）
	sh scripts/backup.sh

restore: check-env check-docker ## 本机恢复：make restore FILE=backups/xxx.tar.gz
	@test -n "$(FILE)" || (echo "用法：make restore FILE=backups/xxx.tar.gz" >&2; exit 1)
	CONFIRM=yes sh scripts/restore.sh $(FILE)

tls-up: check-env check-docker ## 本机启用 Caddy + 自动 HTTPS（需 .env 的 DOMAIN）
	@test -n "$(DOMAIN)" || (echo "请先在 .env 设置 DOMAIN，并把 BIND_ADDR 改为 127.0.0.1" >&2; exit 1)
	$(COMPOSE_TLS) up -d --remove-orphans

tls-down: check-env check-docker ## 停止 Caddy（保留证书卷）
	docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml stop caddy

vps-bootstrap: check-vps ## 在 VPS 上安装 Docker、加 2G swap（需 SSH 密钥）
	$(SSH) $(VPS) 'bash -s' < scripts/bootstrap-vps.sh

vps-login: check-vps ## 在 VPS 上登录 GHCR（使用 .env 的 GHCR_USER/GHCR_TOKEN）
	@test -n "$(GHCR_TOKEN)" || (echo "请在 .env 设置 GHCR_USER 与 GHCR_TOKEN（GitHub PAT，至少 read:packages）" >&2; exit 1)
	@printf '%s' "$(GHCR_TOKEN)" | $(SSH) $(VPS) "docker login ghcr.io -u '$(GHCR_USER)' --password-stdin"

vps-deploy: check-vps ## 上传 compose/脚本到 VPS，拉镜像并启动
	@echo "上传部署文件到 $(VPS):$(VPS_DIR)…"
	@tar -czf - docker-compose.yml Makefile scripts deploy .env.example | \
		$(SSH) $(VPS) "mkdir -p $(VPS_DIR) && tar -xzf - -C $(VPS_DIR)"
	$(SSH) $(VPS) "cd $(VPS_DIR) && chmod 700 scripts/*.sh && sh scripts/init-env.sh && sh scripts/deploy.sh"

deploy: vps-deploy ## 同 vps-deploy

vps-logs: check-vps ## 查看 VPS 日志
	$(SSH) $(VPS) "cd $(VPS_DIR) && docker compose logs -f --tail=200 teamos"

vps-status: check-vps ## 查看 VPS 容器状态
	$(SSH) $(VPS) "cd $(VPS_DIR) && docker compose ps && docker inspect --format 'health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' teamos 2>/dev/null || true"

vps-backup: check-vps ## 在 VPS 上备份（短暂停机）
	$(SSH) $(VPS) "cd $(VPS_DIR) && sh scripts/backup.sh"

vps-backup-cron: check-vps ## 在 VPS 上安装每日 03:17 备份
	$(SSH) $(VPS) "cd $(VPS_DIR) && sh scripts/install-cron.sh $(VPS_DIR)"

vps-tls-up: check-vps ## 在 VPS 上启用 Caddy + 自动 HTTPS（需 .env 的 DOMAIN）
	@test -n "$(DOMAIN)" || (echo "请先在 .env 设置 DOMAIN" >&2; exit 1)
	$(SSH) $(VPS) "cd $(VPS_DIR) && docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d --remove-orphans"

vps-download-backup: check-vps ## 下载 VPS 上最新的备份到本地 backups/
	@mkdir -p backups
	@latest=$$($(SSH) $(VPS) "ls -t $(VPS_DIR)/backups/teamos-*.tar.gz 2>/dev/null | head -n 1"); \
	if [ -n "$$latest" ]; then \
		$(SCP) "$(VPS):$$latest" backups/ && echo "已下载到 backups/"; \
	else \
		echo "VPS 上还没有备份" >&2; exit 1; \
	fi

vps-ssh: check-vps ## SSH 登录 VPS
	$(SSH) $(VPS)

clean: ## 删除本地构建产物
	rm -rf dist .test-data tsconfig.tsbuildinfo
