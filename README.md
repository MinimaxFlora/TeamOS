# TeamOS

TeamOS 是给一家公司私有部署的 AI 工作台：管理员面板 + 员工大厅 + Hermes Agent。
前端、Node API、Hermes 全部打进**同一个镜像**；一个容器、一个端口、一套数据卷。

```
浏览器 ──> TeamOS Node :8080 ──> Hermes Gateway 127.0.0.1:8642 ──> 大模型
              │
              ├── /data         SQLite、会话、审计、加密后的模型 Key
              └── /opt/data     Hermes 工作区、记忆、技能、日志
```

- 不需要单独部署 Hermes，也不需要单独部署数据库。
- Hermes API 只监听容器内回环地址，不对外暴露。
- 首次部署后只需要做两件事：创建管理员账号、在「设置 → 大模型」填服务商与 API Key。

## 1. 准备配置

```bash
make env
```

会从 `.env.example` 生成 `.env`，并生成一次性的 32 字节主密钥 `TEAMOS_SECRET_KEY`。
**这个密钥用于加密模型 Key 和渠道密钥，生成后不要更换。**

编辑 `.env`，至少填写：

```dotenv
VPS_HOST=你的服务器IP或域名
```

## 2. 构建镜像（GitHub Actions → GHCR）

推送到 `main` 或 `master` 后，`.github/workflows/docker.yml` 会构建
`ghcr.io/<owner>/teamos:latest` 和 `sha-<commit>` 标签。

- 仓库 Settings → Actions → General 允许 workflow 运行。
- 第一次构建完成后，到 GitHub Packages 找到 `teamos`。
  默认是私有包；如果不想在服务器上登录 GHCR，可以把包可见性改成 **Public**
  （镜像里不含任何密钥和用户数据）。

本地也可以直接构建：

```bash
make build          # teamos:local
```

## 3. 部署到 VPS

### 方式一：在服务器上一条命令（无需本地 SSH 密钥）

以 root 登录服务器后执行：

```bash
curl -fsSL https://raw.githubusercontent.com/MinimaxFlora/TeamOS/main/scripts/install.sh | sh
```

脚本会依次执行 `bootstrap-vps.sh`（Docker + 2G swap）、`init-env.sh`（生成 `.env`
与一次性主密钥）和 `deploy.sh`（拉取 `ghcr.io/minimaxflora/teamos:latest`、启动并等待健康检查）。
重复执行等同于更新到最新代码并重建容器，`/opt/teamos/.env` 与数据卷都会保留。

### 方式二：本地用 make 推送（需要 SSH 私钥）

前提：本地有 SSH 私钥，服务器能免密登录。

```bash
# 首次：安装 Docker，并在 1.9GB 小机器上加 2G swap
make vps-bootstrap

# 如果 GHCR 包是私有的：在 .env 填 GHCR_USER / GHCR_TOKEN（PAT 至少 read:packages）
make vps-login

# 上传 compose/脚本、生成服务器 .env、拉镜像、启动并等待健康检查
make deploy
```

部署完成后访问 `http://服务器IP:8080`：

1. 第一次打开会显示「初始化你的公司」，创建第一个管理员账号。
2. 管理员进入「设置 → 大模型」，选择服务商、填写模型名和 API Key，点「保存并测试」。
3. 员工通过邀请链接/临时密码加入，进入大厅 @ 助理开始工作。

常用命令：

```bash
make vps-status          # 容器状态 + 健康检查
make vps-logs            # 跟踪日志
make vps-backup          # 立即备份
make vps-backup-cron     # 安装每日 03:17 自动备份
make vps-download-backup # 下载最新备份到本地
make deploy              # 更新到 GHCR 最新镜像
```

## 4. 域名与 HTTPS（正式使用必须做）

直接 IP + HTTP 只适合首次验收。Cookie 和登录密码不应长期走明文。

1. 域名 A 记录指向服务器。
2. 编辑 `.env`：

```dotenv
BIND_ADDR=127.0.0.1
COOKIE_SECURE=true
TRUST_PROXY=true
DOMAIN=team.example.com
```

3. 在本地执行：

```bash
make vps-tls-up
```

Caddy 会自动申请 Let's Encrypt 证书并反代到 `teamos:8080`。
云厂商安全组/防火墙只放行 22、80、443；8080 只绑定回环。

## 5. 数据、备份与恢复

| 路径 | 内容 |
| --- | --- |
| 卷 `teamos-data` → `/data` | `team.db`、`master.key`、会话、审计、日志 |
| 卷 `hermes-data` → `/opt/data` | Hermes 记忆、技能、渠道配置、工作区 |

```bash
make vps-backup                              # 服务器上备份（短暂停机，保证 SQLite 一致）
make vps-download-backup                     # 拉到本地 backups/
make restore FILE=backups/teamos-xxx.tar.gz  # 本机恢复；需要 CONFIRM=yes
```

备份里有公司数据和加密主密钥，务必设置异地/对象存储；不要提交到 Git。
建议每天自动备份，并每周把备份同步到另一台机器。

## 6. 安全边界

- 密码使用 scrypt 哈希；会话 Cookie 为 HttpOnly + SameSite=Lax。
- 模型 Key、渠道密钥使用 AES-256-GCM 加密存储，接口只返回末四位。
- 所有 `/api` 写请求校验同源与登录态；管理员接口额外校验角色。
- Webhook 使用 HMAC-SHA256 验签，事件去重后落库。
- 高风险工具默认关闭或需要审批；附件只允许白名单类型和大小。
- Hermes 端口不发布到宿主机；容器内 Node 以 `hermes` 用户运行。
- 不要提交 `.env`、`master.key`、备份文件；不要在聊天/日志里贴 API Key。
- 如果 root 密码曾经以明文形式传输，部署完成后请立刻更换密码并改用 SSH 密钥。

## 7. 更新与回滚

```bash
make deploy                       # 拉取 latest 并重建
```

GHCR 同时保留 `sha-<commit>` 标签。回滚时在服务器 `/opt/teamos/.env` 把
`TEAMOS_IMAGE` 改成指定 sha 标签，再执行 `make deploy`。

## 8. 排障

```bash
make vps-logs
make vps-ssh
# 容器内
docker compose exec teamos sh
tail -n 100 /data/logs/hermes.log
curl http://127.0.0.1:8080/api/health
```

- **健康检查失败**：先看日志；模型未配置不影响容器启动，但聊天会提示去设置。
- **Hermes 未就绪**：`/api/health` 的 `hermes.status` 会显示 `starting/failed`，
  检查 `/opt/data/logs/hermes.log` 和模型 API Key。
- **GHCR 拉取 401**：执行 `make vps-login`，或把 package 改为 public。
- **内存不足**：确认 `make vps-bootstrap` 已加 2G swap；Hermes 跑浏览器任务时内存会上升。

## 9. 技能市场（SkillHub）

技能中心顶部「技能市场」按 1Panel 应用商店的方式加载远程仓库：
仓库里只有索引（`market.json`）和每个技能一个目录，**导入时才下载该技能的 `SKILL.md`**。

```
管理后台 → Skills 中心 → 技能市场
  ├─ 市场源（默认 https://raw.githubusercontent.com/MinimaxFlora/TeamOS-Skills/main/market.json）
  ├─ 分类 / 来源 / 排序 / 搜索
  └─ 导入 → 进入待审核队列 → 审核启用 → 绑定给助理
```

- 索引由服务端缓存到 `/data/skill-market-cache.json`，有效期 6 小时；「刷新」强制回源。
- GitHub raw 在国内 VPS 上经常不通，服务端会**自动回退到 jsDelivr 镜像**；也可以「更换」成自建镜像。
- 正文下载失败时会回退到 SkillHub 原始接口；两者都失败则提示错误，不会写入半成品技能。
- 默认市场源可以用环境变量 `SKILL_MARKET_SOURCE` 覆盖，管理员也能在界面里改（存数据库）。
- 导入的技能带 `sourceUrl` 与 `slug`，重复导入会被识别；风险等级按正文关键词初判，仍需人工复核。

仓库内容与筛选规则见 [MinimaxFlora/TeamOS-Skills](https://github.com/MinimaxFlora/TeamOS-Skills)。
