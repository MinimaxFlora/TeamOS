import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import { config, ROOT } from './config.mjs'
import {
  countUsers,
  connectorSecret,
  createUser,
  deleteUser,
  deleteUserSessions,
  getFileRow,
  getUserByEmail,
  getUserById,
  getRawState,
  getState,
  listConnectors,
  listUsers,
  recentWebhookEvents,
  resetConnectorRuntime,
  resetState,
  saveConnectorConfig,
  saveState,
  setSetting,
  updateFileRow,
  updateState,
  updateUser,
} from './db.mjs'
import {
  clearSessionCookie,
  createSessionCookie,
  currentSession,
  isAdmin,
  newId,
  requireUser,
  userSummary,
} from './auth.mjs'
import {
  bootstrapFirstAdmin,
  COMPANY_ROOM_ID,
  mergeMemberState,
  nowISO,
  saveAdminState,
  saveMemberState,
  stateForUser,
} from './state.mjs'
import {
  getGatewayStatus,
  initializeGateway,
  listProviderModels,
  publicModelConfig,
  restartGateway,
  saveModelConfig,
  testModel,
} from './hermes.mjs'
import { runAgentChat, testAgentReply } from './chat.mjs'
import { fetchSkillContent, loadMarket, marketStatus, setMarketSource } from './market.mjs'
import { installSkill, listInstalled, skillsRootInfo, uninstallSkill } from './skills.mjs'
import { summarizeTranscriptModel } from './minutes.mjs'
import { acceptWebhook } from './webhooks.mjs'
import { hashPassword, hmacHex, maskSecret, randomToken, sanitizeEmail, verifyPassword } from './security.mjs'
import {
  filePathFor,
  fileText,
  mimeForName,
  publicFile,
  PURPOSE_LIMITS,
  removeFile,
  saveUpload,
  transcribeAudio,
} from './files.mjs'
import {
  fileUsedByApprovedDoc,
  humanSize,
  proposeKnowledgeFromFile,
  sweepExpiredKnowledge,
} from './knowledge.mjs'

function hmacBase64(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest('base64')
}

// 每个渠道的群机器人都有自己的报文格式和签名方式，测试投递必须按真实协议发送，
// 否则「测试成功」并不代表正式消息能送达。
function connectorTestRequest(connector, endpoint, secret, message) {
  switch (connector.kind) {
    case 'feishu': {
      const timestamp = String(Math.floor(Date.now() / 1000))
      return {
        url: endpoint,
        body: JSON.stringify({
          timestamp,
          sign: hmacBase64(`${timestamp}\n${secret}`, ''),
          msg_type: 'text',
          content: { text: message },
        }),
      }
    }
    case 'dingtalk': {
      const timestamp = String(Date.now())
      const target = new URL(endpoint)
      target.searchParams.set('timestamp', timestamp)
      target.searchParams.set('sign', hmacBase64(secret, `${timestamp}\n${secret}`))
      return {
        url: target.toString(),
        body: JSON.stringify({ msgtype: 'text', text: { content: message } }),
      }
    }
    case 'slack':
      return { url: endpoint, body: JSON.stringify({ text: message }) }
    case 'wecom':
      return { url: endpoint, body: JSON.stringify({ msgtype: 'text', text: { content: message } }) }
    default: {
      const timestamp = String(Date.now())
      const body = JSON.stringify({
        event_id: `test_${timestamp}`,
        event_type: 'teamos.test',
        message,
        sent_at: new Date(Number(timestamp)).toISOString(),
      })
      return {
        url: endpoint,
        body,
        headers: {
          'X-TeamOS-Timestamp': timestamp,
          'X-TeamOS-Signature': `sha256=${hmacHex('sha256', secret, `${timestamp}.${body}`)}`,
          'X-TeamOS-Event': 'teamos.test',
        },
      }
    }
  }
}

function providerError(payload) {
  if (!payload || typeof payload !== 'object') return ''
  const code = payload.code ?? payload.errcode ?? payload.StatusCode
  if (code !== undefined && Number(code) !== 0) {
    return String(payload.msg || payload.errmsg || payload.message || `返回码 ${code}`)
  }
  if (payload.ok === false) return String(payload.error || '远端返回 ok=false')
  return ''
}

async function deliverConnectorTest(connector, endpoint, secret) {
  const message = 'TeamOS 连接测试：收到这条消息说明渠道地址与签名配置可用。'
  const request = connectorTestRequest(connector, endpoint, secret, message)
  const started = Date.now()
  try {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TeamOS-Connector-Test/1.0',
        ...(request.headers ?? {}),
      },
      body: request.body,
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })
    const latencyMs = Date.now() - started
    const raw = await response.text().catch(() => '')
    let parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
    const remoteError = providerError(parsed)
    const ok = response.ok && !remoteError
    const detail =
      remoteError ||
      (ok ? '远端已接收测试消息' : raw.slice(0, 200).replace(/\s+/g, ' ') || `远端返回 HTTP ${response.status}`)
    return { ok, status: response.status, latencyMs, message: detail }
  } catch (error) {
    const latencyMs = Date.now() - started
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    return {
      ok: false,
      status: 0,
      latencyMs,
      message: timedOut ? '请求超时（10 秒无响应）' : String(error?.message || error),
    }
  }
}

const server = http.createServer(async (req, res) => {
  const started = Date.now()
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'",
  )
  res.on('finish', () => {
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
    const line = `${level} ${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`
    if (level === 'error') console.error(line)
    else console.log(line)
  })

  try {
    if (url.pathname.startsWith('/api/webhooks/')) {
      await handleWebhook(req, res, url)
      return
    }
    if (url.pathname.startsWith('/api/')) {
      if (!['GET', 'HEAD'].includes(req.method) && !sameOrigin(req)) {
        sendJson(res, 403, { error: 'origin_mismatch' })
        return
      }
      await handleApi(req, res, url)
      return
    }
    serveStatic(req, res, url)
  } catch (error) {
    const status = Number(error.status) || 500
    if (status >= 500) console.error('request failed:', error.stack || error.message)
    if (!res.headersSent) {
      sendJson(res, status, { error: error.publicMessage || error.message || 'internal_error' })
    } else {
      res.end()
    }
  }
})

function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function sendError(res, status, message) {
  const error = new Error(message)
  error.status = status
  throw error
}

async function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        const error = new Error('请求体过大')
        error.status = 413
        req.destroy()
        reject(error)
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readJson(req, limit = config.maxBodyBytes) {
  const raw = await readBody(req, limit)
  if (!raw.length) return {}
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    sendError(null, 400, '请求 JSON 格式不正确')
  }
}

function originHint(value) {
  try {
    const url = new URL(value.trim())
    const first = url.pathname.split('/').filter(Boolean)[0]
    return first ? `${url.origin}/${first}/…` : `${url.origin}/…`
  } catch {
    return ''
  }
}

const buckets = new Map()
function rateLimit(key, limit, windowMs) {
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket || bucket.reset < now) {
    bucket = { count: 0, reset: now + windowMs }
    buckets.set(key, bucket)
  }
  bucket.count += 1
  if (bucket.count > limit) {
    const error = new Error('请求过于频繁，请稍后再试')
    error.status = 429
    throw error
  }
  if (buckets.size > 10000) {
    for (const [bucketKey, item] of buckets) if (item.reset < now) buckets.delete(bucketKey)
  }
}

function clientIp(req) {
  if (config.trustProxy && req.headers['x-forwarded-for']) {
    return String(req.headers['x-forwarded-for']).split(',')[0].trim()
  }
  return req.socket.remoteAddress || 'unknown'
}

const AVATAR_COLORS = ['#2f55d4', '#11795c', '#9a5b07', '#b93c3c', '#6b5bd2', '#0f766e', '#56657a', '#7a4a2b']

// 管理端试用助理时允许提交未保存的草稿；这里只保留模型需要的字段并限长。
function draftAgentForTest(input, state) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error('助理配置格式不正确')
    error.status = 400
    throw error
  }
  const existing = (state.agents ?? []).find((agent) => agent.id === input.id) ?? {}
  const text = (value, fallback, max = 2000) =>
    typeof value === 'string' ? value.trim().slice(0, max) : fallback
  const list = (value, fallback, maxItems, maxLength) =>
    Array.isArray(value)
      ? value
          .filter((item) => typeof item === 'string' && item.trim())
          .slice(0, maxItems)
          .map((item) => item.trim().slice(0, maxLength))
      : fallback
  const skillIds = new Set((state.skills ?? []).map((skill) => skill.id))
  const knowledgeIds = new Set((state.knowledge ?? []).map((space) => space.id))
  const temperature = Number(input.model?.temperature)
  return {
    ...existing,
    id: text(input.id, existing.id || 'preview', 100),
    name: text(input.name, existing.name || '测试助理', 60),
    title: text(input.title, existing.title || '助理', 80),
    department: text(input.department, existing.department || '未分组', 80),
    description: text(input.description, existing.description || '', 2000),
    responsibilities: list(input.responsibilities, existing.responsibilities ?? [], 12, 240),
    instructions: text(input.instructions, existing.instructions || '', 4000),
    tone: text(input.tone, existing.tone || '清晰、克制', 300),
    outOfScope: text(input.outOfScope, existing.outOfScope || '', 1000),
    escalation: text(input.escalation, existing.escalation || '', 1000),
    skills: list(input.skills, existing.skills ?? [], 24, 100).filter((id) => skillIds.has(id)),
    knowledge: list(input.knowledge, existing.knowledge ?? [], 24, 100).filter((id) =>
      knowledgeIds.has(id),
    ),
    tools: list(input.tools, existing.tools ?? [], 16, 40),
    model: {
      ...(existing.model ?? {}),
      id: text(input.model?.id, existing.model?.id || 'default', 100),
      temperature: Number.isFinite(temperature)
        ? Math.min(2, Math.max(0, temperature))
        : (existing.model?.temperature ?? 0.4),
    },
  }
}

function sanitizeAccount(value) {
  const account = String(value || '').trim().toLowerCase()
  if (!account || account.length > 120) return ''
  if (account.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account) ? account : ''
  }
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(account) ? account : ''
}

function validateRegistration(body) {
  const email = sanitizeAccount(body.account ?? body.email)
  const password = String(body.password || '')
  const name = (String(body.name || '').trim() || email.split('@')[0] || '').slice(0, 30)
  const jobTitle = String(body.jobTitle || '待分配').trim().slice(0, 40) || '待分配'
  const department = String(body.department || '未分组').trim().slice(0, 40) || '未分组'
  if (!email) {
    throw Object.assign(new Error('账号需为 3-32 位字母、数字或邮箱'), { status: 400 })
  }
  if (password.length < 8 || password.length > 200) {
    throw Object.assign(new Error('密码至少 8 位'), { status: 400 })
  }
  return { name, email, password, jobTitle, department }
}

function memberObject({ id, name, email, jobTitle, department, role, status, color, groupIds }) {
  return {
    id,
    name,
    email,
    jobTitle,
    department,
    role,
    status,
    color,
    joinedAt: nowISO(),
    groupIds,
  }
}

/** Owner and admin always may read a file; approved knowledge and hall attachments are shared. */
function canReadFile(row, user) {
  if (!row) return false
  if (row.owner_id === user.member_id || user.role === 'admin') return true
  const state = getState()
  const approved = (state.knowledgeDocs ?? []).some(
    (doc) =>
      doc.fileId === row.id &&
      doc.status === 'ready' &&
      (!doc.restricted || doc.ownerId === user.member_id),
  )
  if (approved) return true
  return (state.messages ?? []).some((message) =>
    (message.attachments ?? []).some((item) => item.id === row.id),
  )
}

function sendStoredFile(req, res, row, { inline = false } = {}) {
  const target = filePathFor(row)
  let stat
  try {
    stat = fs.statSync(target)
  } catch {
    sendError(res, 410, '文件已不存在')
  }
  const fallback = row.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')
  res.writeHead(200, {
    'content-type': row.mime || mimeForName(row.name),
    'content-length': stat.size,
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    'cache-control': 'private, no-store',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  fs.createReadStream(target).pipe(res)
}

function recordKnowledgeAudit(user, action, target, detail) {
  updateState((state) => ({
    ...state,
    audit: [
      { id: newId('au'), at: nowISO(), actorId: user.member_id, action, target, detail },
      ...(state.audit ?? []),
    ].slice(0, 2000),
  }))
}

async function handleApi(req, res, url) {
  const pathname = url.pathname

  if (pathname === '/api/health' && req.method === 'GET') {
    const { revision } = getRawState()
    sendJson(res, 200, {
      ok: true,
      revision,
      hermes: getGatewayStatus(),
      modelConfigured: publicModelConfig().keySet,
      setupRequired: countUsers() === 0,
    })
    return
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    sweepExpiredKnowledge()
    const user = currentSession(req)
    if (!user) {
      sendJson(res, 200, { authenticated: false, setupRequired: countUsers() === 0 })
      return
    }
    const state = stateForUser(user)
    const member = (state.members ?? []).find((item) => item.id === user.member_id)
    sendJson(res, 200, {
      authenticated: true,
      user: { ...userSummary(user), member },
      state,
      revision: getRawState().revision,
      setupRequired: false,
    })
    return
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    rateLimit(`register:${clientIp(req)}`, 8, 15 * 60 * 1000)
    const body = await readJson(req, 256 * 1024)
    const input = validateRegistration(body)
    if (getUserByEmail(input.email)) sendError(res, 409, '这个邮箱已经加入公司，请直接登录')
    const first = countUsers() === 0
    const memberId = newId('u')
    const userId = newId('user')
    const role = first ? 'admin' : 'member'
    const status = first ? 'active' : 'pending'
    const member = memberObject({
      id: memberId,
      name: input.name,
      email: input.email,
      jobTitle: first ? input.jobTitle : '待分配',
      department: input.department,
      role,
      status,
      color: AVATAR_COLORS[countUsers() % AVATAR_COLORS.length],
      groupIds: first ? ['g_all'] : [],
    })
    createUser({
      id: userId,
      memberId,
      email: input.email,
      passwordHash: hashPassword(input.password),
      role,
      status,
    })
    const { state } = getRawState()
    let next
    if (first) {
      next = bootstrapFirstAdmin(state, {
        member,
        companyName: process.env.COMPANY_NAME || String(body.companyName || '我的公司').trim(),
      })
    } else {
      next = {
        ...state,
        members: [...(state.members ?? []), member],
        audit: [
          {
            id: newId('au'),
            at: nowISO(),
            actorId: memberId,
            action: '员工自助注册',
            target: member.name,
            detail: '等待管理员审批',
          },
          ...(state.audit ?? []),
        ],
      }
    }
    saveState(next)
    if (first) resetConnectorRuntime()
    if (!first) {
      sendJson(res, 201, {
        authenticated: false,
        pending: true,
        message: '注册申请已提交，请等待管理员通过后再登录。',
      })
      return
    }
    const cookie = createSessionCookie(userId)
    res.setHeader('set-cookie', cookie)
    const user = getUserById(userId)
    sendJson(res, 201, {
      authenticated: true,
      user: { ...userSummary(user), member },
      state: stateForUser(user),
      revision: getRawState().revision,
      setupRequired: false,
    })
    return
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    rateLimit(`login:${clientIp(req)}`, 20, 15 * 60 * 1000)
    const body = await readJson(req, 128 * 1024)
    const email = sanitizeEmail(body.email)
    const password = String(body.password || '')
    rateLimit(`login-email:${email}`, 10, 15 * 60 * 1000)
    const user = getUserByEmail(email)
    if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
      sendError(res, 401, '邮箱或密码不正确')
    }
    if (user.status === 'disabled') sendError(res, 403, '账号已被停用')
    if (user.status === 'pending') {
      sendError(res, 403, '注册申请已提交，请等待管理员通过后再登录')
    }
    if (user.status === 'invited') {
      updateUser(user.id, { status: 'active', last_login_at: nowISO() })
      updateState((state) => ({
        ...state,
        members: (state.members ?? []).map((member) =>
          member.id === user.member_id
            ? { ...member, status: 'active', groupIds: [COMPANY_ROOM_ID] }
            : member,
        ),
        groups: (state.groups ?? []).map((group) =>
          group.id === COMPANY_ROOM_ID
            ? {
                ...group,
                memberIds: [...new Set([...(group.memberIds ?? []), user.member_id])],
                updatedAt: nowISO(),
              }
            : group,
        ),
      }))
    } else {
      updateUser(user.id, { last_login_at: nowISO() })
    }
    const fresh = getUserById(user.id)
    res.setHeader('set-cookie', createSessionCookie(user.id))
    const state = stateForUser(fresh)
    sendJson(res, 200, {
      authenticated: true,
      user: {
        ...userSummary(fresh),
        member: (state.members ?? []).find((member) => member.id === fresh.member_id),
      },
      state,
      revision: getRawState().revision,
      setupRequired: false,
    })
    return
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    res.setHeader('set-cookie', clearSessionCookie(req))
    sendJson(res, 200, { ok: true })
    return
  }

  if (pathname === '/api/auth/password' && req.method === 'POST') {
    const user = requireUser(req)
    if (!user) sendError(res, 401, '请先登录')
    const body = await readJson(req, 64 * 1024)
    if (!verifyPassword(String(body.currentPassword || ''), user.password_hash)) {
      sendError(res, 401, '当前密码不正确')
    }
    const nextPassword = String(body.newPassword || '')
    if (nextPassword.length < 8) sendError(res, 400, '新密码至少 8 位')
    updateUser(user.id, { password_hash: hashPassword(nextPassword) })
    deleteUserSessions(user.id)
    res.setHeader('set-cookie', createSessionCookie(user.id))
    sendJson(res, 200, { ok: true })
    return
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    const user = requireUser(req)
    if (!user) sendError(res, 401, '请先登录')
    sweepExpiredKnowledge()
    sendJson(res, 200, {
      state: stateForUser(user),
      revision: getRawState().revision,
      user: userSummary(user),
    })
    return
  }

  if (pathname === '/api/state' && req.method === 'PUT') {
    const user = requireUser(req)
    if (!user) sendError(res, 401, '请先登录')
    const body = await readJson(req)
    if (!body.state || typeof body.state !== 'object') sendError(res, 400, '缺少 state')
    const result = isAdmin(user)
      ? saveAdminState(body.state, user)
      : saveMemberState(body.state, user)
    sendJson(res, 200, result)
    return
  }

  if (pathname === '/api/state/reset' && req.method === 'POST') {
    const user = requireUser(req)
    if (!isAdmin(user)) sendError(res, 403, '只有管理员可以重置')
    const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'seed.json'), 'utf8'))
    const users = countUsers()
    if (users > 0) sendError(res, 409, '正式实例不允许重置演示数据')
    resetState(seed)
    sendJson(res, 200, { state: stateForUser(user), revision: getRawState().revision })
    return
  }

  if (pathname === '/api/model' && req.method === 'GET') {
    const user = requireUser(req)
    if (!isAdmin(user)) sendError(res, 403, '需要管理员权限')
    sendJson(res, 200, publicModelConfig())
    return
  }

  if (pathname === '/api/model' && req.method === 'PUT') {
    const user = requireUser(req)
    if (!isAdmin(user)) sendError(res, 403, '需要管理员权限')
    const body = await readJson(req, 128 * 1024)
    let model
    try {
      model = saveModelConfig(body)
    } catch (error) {
      sendError(res, 400, error.message)
      return
    }
    restartGateway().catch((error) => console.error('gateway restart failed:', error.message))
    sendJson(res, 200, {
      ok: true,
      model: {
        provider: model.provider,
        model: model.model,
        baseUrl: model.baseUrl,
        keySet: true,
        keyHint: maskSecret(model.apiKey),
        updatedAt: model.updatedAt,
      },
      hermes: getGatewayStatus(),
      restarting: true,
    })
    return
  }

  if (pathname === '/api/model/test' && req.method === 'POST') {
    const user = requireUser(req)
    if (!isAdmin(user)) sendError(res, 403, '需要管理员权限')
    if (!publicModelConfig().keySet) sendError(res, 400, '请先保存模型配置')
    try {
      const result = await testModel()
      sendJson(res, 200, result)
    } catch (error) {
      sendJson(res, 502, { ok: false, error: error.message })
    }
    return
  }

  if (pathname === '/api/agents/test' && req.method === 'POST') {
    const user = requireUser(req)
    if (!isAdmin(user)) sendError(res, 403, '需要管理员权限')
    rateLimit(`agent-test:${user.id}`, 30, 60 * 60 * 1000)
    const body = await readJson(req, 256 * 1024)
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt) sendError(res, 400, '请先填写测试问题')
    if (prompt.length > 8000) sendError(res, 400, '测试问题过长')
    const state = stateForUser(user)
    const agent = draftAgentForTest(body.agent, state)
    try {
      const result = await testAgentReply({ state, user, agent, prompt })
      sendJson(res, 200, { ok: true, agentId: agent.id, ...result })
    } catch (error) {
      sendJson(res, 502, { ok: false, error: error.message })
    }
    return
  }

  if (pathname === '/api/connectors' && req.method === 'GET') {
    const user = requireUser(req)
    if (!isAdmin(user)) sendError(res, 403, '需要管理员权限')
    sendJson(res, 200, {
      connectors: listConnectors().map((row) => ({
        id: row.id,
        status: row.status,
        signature: Boolean(row.signature),
        scopes: safeJson(row.scopes, []),
        events: row.events,
        lastEventAt: row.last_event_at,
        endpointHint: row.endpoint_hint,
        secretSet: Boolean(row.secret_enc),
        secretHint: row.secret_hint,
      })),
    })
    return
  }

  const connectorMatch = /^\/api\/connectors\/([A-Za-z0-9_-]+)(?:\/(events|test))?$/.exec(pathname)
  if (connectorMatch) {
    const user = requireUser(req)
    if (!isAdmin(user)) sendError(res, 403, '需要管理员权限')
    const [, id, action] = connectorMatch
    const state = getState()
    const connector = (state.connectors ?? []).find((item) => item.id === id)
    if (!connector) sendError(res, 404, '渠道不存在')
    if (action === 'events' && req.method === 'GET') {
      sendJson(res, 200, { events: recentWebhookEvents(id, 50) })
      return
    }
    if (action === 'test' && req.method === 'POST') {
      if (connector.status !== 'connected' || !connector.signature) {
        sendError(res, 409, '请先启用渠道并开启签名校验')
      }
      const config = connectorSecret(id)
      if (!config?.endpoint) sendError(res, 409, '请先在渠道设置里填写目标地址')
      if (!config?.secret) sendError(res, 409, '请先配置签名密钥')
      const delivery = await deliverConnectorTest(connector, config.endpoint, config.secret)
      const testedAt = nowISO()
      updateState((current) => ({
        ...current,
        connectors: (current.connectors ?? []).map((item) =>
          item.id === id
            ? {
                ...item,
                lastTest: {
                  at: testedAt,
                  ok: delivery.ok,
                  status: delivery.status,
                  latencyMs: delivery.latencyMs,
                  message: delivery.message,
                },
              }
            : item,
        ),
        audit: [
          {
            id: newId('au'),
            at: testedAt,
            actorId: user.member_id,
            action: '渠道连通性测试',
            target: connector.name,
            detail: delivery.ok
              ? `远端 HTTP ${delivery.status}，耗时 ${delivery.latencyMs}ms`
              : `投递失败：${delivery.message}`,
          },
          ...(current.audit ?? []),
        ],
      }))
      const nextState = getState()
      sendJson(res, 200, {
        ok: delivery.ok,
        delivery,
        state: stateForUser(user),
        revision: getRawState().revision,
        connectors: (nextState.connectors ?? []).filter((item) => item.id === id),
      })
      return
    }
    if (req.method === 'PUT' && !action) {
      const body = await readJson(req, 256 * 1024)
      const endpoint = body.endpoint === undefined ? undefined : String(body.endpoint || '').trim()
      const secret = body.secret === undefined ? undefined : String(body.secret || '').trim()
      if (endpoint !== undefined && endpoint) {
        try {
          const parsed = new URL(endpoint)
          if (parsed.protocol !== 'https:') sendError(res, 400, 'Webhook 地址必须使用 https://')
        } catch {
          sendError(res, 400, 'Webhook 地址格式不正确')
        }
      }
      if (secret !== undefined && secret && secret.length < 8) sendError(res, 400, '签名密钥至少 8 位')
      const row = listConnectors().find((item) => item.id === id)
      const status = body.status === 'connected' ? 'connected' : body.status === 'disconnected' ? 'disconnected' : row?.status
      const signature = body.signature === undefined ? Boolean(row?.signature) : Boolean(body.signature)
      if (status === 'connected') {
        if (!signature) sendError(res, 400, '启用前必须开启签名校验')
        const endpointResolved = endpoint || row?.endpoint_enc
        if (!endpointResolved) sendError(res, 400, '请先填写 Webhook 地址')
        if (!row?.secret_enc && !secret) sendError(res, 400, '请先配置签名密钥')
      }
      const saved = saveConnectorConfig(id, {
        endpoint,
        secret,
        status,
        signature,
        scopes: Array.isArray(body.scopes) ? body.scopes.slice(0, 30) : undefined,
        endpointHint: endpoint !== undefined ? originHint(endpoint) : undefined,
      })
      updateState((current) => ({
        ...current,
        connectors: (current.connectors ?? []).map((item) =>
          item.id === id
            ? {
                ...item,
                status: saved.status === 'connected' ? 'connected' : 'disconnected',
                signature: Boolean(saved.signature),
                scopes: safeJson(saved.scopes, []),
                endpointHint: saved.endpoint_hint || item.endpointHint,
                secretSet: Boolean(saved.secret_enc),
                secretHint: saved.secret_hint || item.secretHint,
              }
            : item,
        ),
      }))
      sendJson(res, 200, {
        ok: true,
        connector: {
          id,
          status: saved.status,
          signature: Boolean(saved.signature),
          scopes: safeJson(saved.scopes, []),
          endpointHint: saved.endpoint_hint,
          secretSet: Boolean(saved.secret_enc),
          secretHint: saved.secret_hint,
        },
        state: stateForUser(user),
        revision: getRawState().revision,
      })
      return
    }
    sendError(res, 405, '不支持的请求方法')
  }

  if (pathname === '/api/members/invite' && req.method === 'POST') {
    const user = requireUser(req)
    if (!isAdmin(user)) sendError(res, 403, '需要管理员权限')
    const body = await readJson(req, 128 * 1024)
    const input = validateRegistration({ ...body, password: 'temporary-not-used' })
    const role = body.role === 'admin' ? 'admin' : 'member'
    if (getUserByEmail(input.email)) sendError(res, 409, '该邮箱已在成员列表中')
    const temporaryPassword = randomToken(9).replace(/[-_]/g, 'x').slice(0, 12)
    const memberId = newId('u')
    const userId = newId('user')
    const member = memberObject({
      id: memberId,
      name: input.name,
      email: input.email,
      jobTitle: input.jobTitle,
      department: input.department,
      role,
      status: 'invited',
      color: AVATAR_COLORS[countUsers() % AVATAR_COLORS.length],
      groupIds: [],
    })
    createUser({
      id: userId,
      memberId,
      email: input.email,
      passwordHash: hashPassword(temporaryPassword),
      role,
      status: 'invited',
    })
    updateState((state) => ({
      ...state,
      members: [...(state.members ?? []), member],
      audit: [
        {
          id: newId('au'),
          at: nowISO(),
          actorId: user.member_id,
          action: '邀请成员',
          target: `${member.name} · ${member.jobTitle}`,
          detail: `临时密码已生成，首次登录后生效：${member.email}`,
        },
        ...(state.audit ?? []),
      ],
    }))
    sendJson(res, 201, {
      ok: true,
      temporaryPassword,
      member,
      state: stateForUser(user),
      revision: getRawState().revision,
    })
    return
  }

  const memberMatch = /^\/api\/members\/([A-Za-z0-9_-]+)$/.exec(pathname)
  if (memberMatch && req.method === 'PATCH') {
    const user = requireUser(req)
    if (!isAdmin(user)) sendError(res, 403, '需要管理员权限')
    const memberId = memberMatch[1]
    const body = await readJson(req, 64 * 1024)
    const current = getState()
    const member = (current.members ?? []).find((item) => item.id === memberId)
    if (!member) sendError(res, 404, '成员不存在')
    const targetUser = listUsers().find((row) => row.member_id === memberId)
    if (memberId === user.member_id) {
      if (body.role !== undefined && body.role !== 'admin') sendError(res, 400, '不能取消自己的管理员权限')
      if (body.status !== undefined && body.status !== 'active') sendError(res, 400, '不能停用自己的账号')
    }
    const patch = {}
    if (body.name !== undefined) {
      const name = String(body.name).trim().slice(0, 30)
      if (!name) sendError(res, 400, '姓名不能为空')
      patch.name = name
    }
    if (body.jobTitle !== undefined) patch.jobTitle = String(body.jobTitle).trim().slice(0, 40)
    if (body.department !== undefined) patch.department = String(body.department).trim().slice(0, 40)
    if (body.bio !== undefined) patch.bio = String(body.bio).trim().slice(0, 400)
    if (body.role !== undefined) {
      if (!['admin', 'member'].includes(body.role)) sendError(res, 400, '角色不合法')
      patch.role = body.role
    }
    if (body.status !== undefined) {
      if (!['active', 'invited', 'pending', 'disabled'].includes(body.status)) sendError(res, 400, '状态不合法')
      patch.status = body.status
    }
    if (!Object.keys(patch).length) sendError(res, 400, '没有可更新的字段')
    if (patch.role === 'member' || patch.status === 'disabled') {
      const remainingAdmins = (current.members ?? []).filter(
        (item) => item.role === 'admin' && item.status === 'active' && item.id !== memberId,
      )
      if (member.role === 'admin' && member.status === 'active' && remainingAdmins.length === 0) {
        sendError(res, 409, '公司至少需要保留一名在职管理员')
      }
    }
    const userPatch = {}
    if (patch.role) userPatch.role = patch.role
    if (patch.status) userPatch.status = patch.status
    if (Object.keys(userPatch).length && targetUser) {
      updateUser(targetUser.id, userPatch)
      if (patch.status === 'disabled') deleteUserSessions(targetUser.id)
    }
    const approving = patch.status === 'active' && member.status === 'pending'
    updateState((state) => ({
      ...state,
      members: (state.members ?? []).map((item) =>
        item.id === memberId
          ? {
              ...item,
              ...patch,
              jobTitle: patch.jobTitle ?? (approving ? '待分配' : item.jobTitle),
              groupIds: approving ? [COMPANY_ROOM_ID] : item.groupIds,
            }
          : item,
      ),
      groups: approving
        ? (state.groups ?? []).map((group) =>
            group.id === COMPANY_ROOM_ID
              ? {
                  ...group,
                  memberIds: [...new Set([...(group.memberIds ?? []), memberId])],
                  updatedAt: nowISO(),
                }
              : group,
          )
        : state.groups,
      audit: [
        {
          id: newId('au'),
          at: nowISO(),
          actorId: user.member_id,
          action: approving ? '通过注册申请' : '修改成员信息',
          target: member.name,
          detail: Object.entries(patch)
            .map(([key, value]) => `${key} → ${String(value)}`)
            .join('，'),
        },
        ...(state.audit ?? []),
      ],
    }))
    sendJson(res, 200, {
      ok: true,
      member: (getState().members ?? []).find((item) => item.id === memberId),
      state: stateForUser(user),
      revision: getRawState().revision,
    })
    return
  }

  if (memberMatch && req.method === 'DELETE') {
    const user = requireUser(req)
    if (!isAdmin(user)) sendError(res, 403, '需要管理员权限')
    const memberId = memberMatch[1]
    if (memberId === user.member_id) sendError(res, 400, '不能删除自己的账号')
    const current = getState()
    const member = (current.members ?? []).find((item) => item.id === memberId)
    if (!member) sendError(res, 404, '成员不存在')
    if (member.role === 'admin') sendError(res, 409, '请先取消该成员的管理员权限')
    const targetUser = listUsers().find((row) => row.member_id === memberId)
    if (targetUser) deleteUser(targetUser.id)
    updateState((state) => ({
      ...state,
      members: (state.members ?? []).filter((item) => item.id !== memberId),
      groups: (state.groups ?? []).map((group) => ({
        ...group,
        memberIds: (group.memberIds ?? []).filter((id) => id !== memberId),
      })),
      audit: [
        {
          id: newId('au'),
          at: nowISO(),
          actorId: user.member_id,
          action: member.status === 'pending' ? '拒绝注册申请' : '删除成员',
          target: member.name,
          detail: member.email,
        },
        ...(state.audit ?? []),
      ],
    }))
    sendJson(res, 200, {
      ok: true,
      state: stateForUser(user),
      revision: getRawState().revision,
    })
    return
  }

  if (pathname === '/api/model/catalog' && req.method === 'POST') {
    const user = requireUser(req)
    if (!isAdmin(user)) sendError(res, 403, '需要管理员权限')
    rateLimit(`catalog:${user.id}`, 40, 60 * 1000)
    const body = await readJson(req, 64 * 1024)
    try {
      const models = await listProviderModels({
        provider: body.provider,
        baseUrl: body.baseUrl,
        apiKey: body.apiKey,
      })
      sendJson(res, 200, { ok: true, models })
    } catch (error) {
      sendJson(res, 502, { ok: false, error: error.message })
    }
    return
  }

  if (pathname === '/api/files' && req.method === 'POST') {
    const user = requireUser(req)
    if (!user) sendError(res, 401, '请先登录')
    rateLimit(`upload:${user.id}`, 60, 60 * 1000)
    const purpose = String(url.searchParams.get('purpose') || 'chat')
    if (!PURPOSE_LIMITS[purpose]) sendError(res, 400, '上传用途不合法')
    const name = String(url.searchParams.get('name') || '').trim().slice(0, 200)
    if (!name) sendError(res, 400, '缺少文件名')
    const raw = await readBody(req, PURPOSE_LIMITS[purpose] + 4096)
    const row = saveUpload({
      buffer: raw,
      name,
      mime: String(req.headers['content-type'] || ''),
      ownerId: user.member_id,
      purpose,
    })
    sendJson(res, 201, { ok: true, file: publicFile(row) })
    return
  }

  const fileMatch = /^\/api\/files\/(f_[A-Za-z0-9]+)(?:\/(text|propose|transcribe))?$/.exec(pathname)
  if (fileMatch) {
    const user = requireUser(req)
    if (!user) sendError(res, 401, '请先登录')
    const [, fileId, action] = fileMatch
    const row = getFileRow(fileId)
    if (!row) sendError(res, 404, '文件不存在')

    if (!action && ['GET', 'HEAD'].includes(req.method)) {
      if (!canReadFile(row, user)) sendError(res, 403, '没有下载这个文件的权限')
      sendStoredFile(req, res, row, { inline: url.searchParams.get('inline') === '1' })
      return
    }
    if (!action && req.method === 'DELETE') {
      if (row.owner_id !== user.member_id && user.role !== 'admin') {
        sendError(res, 403, '只能删除自己上传的文件')
      }
      if (fileUsedByApprovedDoc(getState(), row.id)) {
        sendError(res, 409, '这个文件已经归档到知识库，请先在知识库里移除')
      }
      removeFile(row.id)
      sendJson(res, 200, { ok: true })
      return
    }
    if (action === 'text' && req.method === 'GET') {
      if (row.owner_id !== user.member_id && user.role !== 'admin') {
        sendError(res, 403, '只能查看自己上传文件的文字内容')
      }
      sendJson(res, 200, {
        ok: true,
        text: fileText(row),
        file: publicFile(row),
      })
      return
    }
    if (action === 'propose' && req.method === 'POST') {
      const body = await readJson(req, 256 * 1024)
      const doc = proposeKnowledgeFromFile({
        user,
        fileId: row.id,
        title: body.title,
        spaceId: body.spaceId,
        summary: body.summary,
        tags: body.tags,
        restricted: body.restricted,
        approve: user.role === 'admin',
      })
      recordKnowledgeAudit(
        user,
        '提交知识归档',
        doc.title,
        doc.status === 'ready'
          ? `管理员上传，已直接生效：《${row.name}》`
          : `《${row.name}》等待管理员审批，7 天内有效`,
      )
      sendJson(res, 201, {
        ok: true,
        doc,
        state: stateForUser(user),
        revision: getRawState().revision,
      })
      return
    }
    if (action === 'transcribe' && req.method === 'POST') {
      if (row.owner_id !== user.member_id && user.role !== 'admin') {
        sendError(res, 403, '只能转写自己上传的录音')
      }
      if (row.kind !== 'audio' && row.kind !== 'video') {
        sendError(res, 400, '这个文件不是音频或视频')
      }
      rateLimit(`stt:${user.id}`, 20, 60 * 60 * 1000)
      const result = transcribeAudio(filePathFor(row))
      if (result.text) updateFileRow(row.id, { text: result.text })
      sendJson(res, 200, { ok: true, text: result.text, durationSec: result.durationSec })
      return
    }
    sendError(res, 405, '不支持的请求方法')
  }

  const knowledgeMatch = /^\/api\/knowledge\/([A-Za-z0-9_-]+)(?:\/(approve|reject))?$/.exec(pathname)
  if (knowledgeMatch) {
    const user = requireUser(req)
    if (!isAdmin(user)) sendError(res, 403, '需要管理员权限')
    const [, docId, action] = knowledgeMatch
    const current = getRawState().state
    const doc = (current.knowledgeDocs ?? []).find((item) => item.id === docId)
    if (!doc) sendError(res, 404, '知识条目不存在')

    if (action === 'approve' && req.method === 'POST') {
      let content = String(doc.content || '')
      if (!content && doc.fileId) {
        const fileRow = getFileRow(doc.fileId)
        if (fileRow) content = fileText(fileRow)
      }
      updateState((state) => ({
        ...state,
        knowledgeDocs: (state.knowledgeDocs ?? []).map((item) =>
          item.id === docId
            ? {
                ...item,
                status: 'ready',
                content,
                expiresAt: null,
                approvedAt: nowISO(),
                approvedBy: user.member_id,
                updatedAt: nowISO(),
              }
            : item,
        ),
      }))
      recordKnowledgeAudit(user, '审批通过知识归档', doc.title, `来源：${doc.source || '员工归档'}`)
      sendJson(res, 200, {
        ok: true,
        state: stateForUser(user),
        revision: getRawState().revision,
      })
      return
    }
    if (action === 'reject' && req.method === 'POST') {
      const remaining = (current.knowledgeDocs ?? []).filter((item) => item.id !== docId)
      saveState({ ...current, knowledgeDocs: remaining })
      if (doc.fileId) {
        const stillUsed = remaining.some((item) => item.fileId === doc.fileId && item.status === 'ready')
        if (!stillUsed) removeFile(doc.fileId)
      }
      recordKnowledgeAudit(user, '驳回知识归档', doc.title, `《${doc.fileName || doc.title}》已删除`)
      sendJson(res, 200, {
        ok: true,
        state: stateForUser(user),
        revision: getRawState().revision,
      })
      return
    }
    if (!action && req.method === 'PATCH') {
      const body = await readJson(req, 1024 * 1024)
      const patch = {}
      if (body.title !== undefined) {
        const title = String(body.title).trim().slice(0, 80)
        if (!title) sendError(res, 400, '标题不能为空')
        patch.title = title
      }
      if (body.summary !== undefined) patch.summary = String(body.summary).trim().slice(0, 400)
      if (body.content !== undefined) patch.content = String(body.content).slice(0, 400000)
      if (body.restricted !== undefined) patch.restricted = Boolean(body.restricted)
      if (body.spaceId !== undefined) {
        if (!(current.knowledge ?? []).some((space) => space.id === body.spaceId)) {
          sendError(res, 400, '知识空间不存在')
        }
        patch.spaceId = body.spaceId
      }
      if (Array.isArray(body.tags)) {
        patch.tags = body.tags
          .filter((tag) => typeof tag === 'string' && tag.trim())
          .slice(0, 8)
          .map((tag) => tag.trim().slice(0, 20))
      }
      patch.updatedAt = nowISO()
      updateState((state) => ({
        ...state,
        knowledgeDocs: (state.knowledgeDocs ?? []).map((item) =>
          item.id === docId ? { ...item, ...patch } : item,
        ),
      }))
      sendJson(res, 200, {
        ok: true,
        doc: (getState().knowledgeDocs ?? []).find((item) => item.id === docId),
        state: stateForUser(user),
        revision: getRawState().revision,
      })
      return
    }
    sendError(res, 405, '不支持的请求方法')
  }

  if (pathname === '/api/meetings/summarize' && req.method === 'POST') {
    const user = requireUser(req)
    if (!user) sendError(res, 401, '请先登录')
    rateLimit(`minutes:${user.id}`, 20, 60 * 60 * 1000)
    const body = await readJson(req, 2 * 1024 * 1024)
    const title = String(body.title || '').trim().slice(0, 80)
    const transcript = String(body.transcript || '').trim()
    if (!title) sendError(res, 400, '请填写会议标题')
    if (!transcript) sendError(res, 400, '请粘贴会议文字记录')
    if (transcript.length > 60000) sendError(res, 413, '文字记录过长（上限 60000 字）')
    const state = getState()
    const participantIds = Array.isArray(body.participantIds) ? body.participantIds.slice(0, 50) : []
    const participants = (state.members ?? []).filter((member) => participantIds.includes(member.id))
    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })
    try {
      const result = await summarizeTranscriptModel({
        title,
        transcript,
        participants,
        signal: controller.signal,
      })
      sendJson(res, 200, result)
    } catch (error) {
      if (error.name === 'AbortError') return
      sendJson(res, 502, { error: error.message })
    }
    return
  }

  if (pathname === '/api/chat' && req.method === 'POST') {
    const user = requireUser(req)
    if (!user) sendError(res, 401, '请先登录')
    rateLimit(`chat:${user.id}`, 40, 60 * 1000)
    const body = await readJson(req, 1024 * 1024)
    const agentId = String(body.agentId || '')
    const sessionId = String(body.sessionId || '')
    const prompt = String(body.message || '').trim()
    const runId = String(body.runId || '')
    if (!agentId || !sessionId || !prompt) sendError(res, 400, '缺少助理、会话或消息内容')
    if (prompt.length > 12000) sendError(res, 413, '单条消息过长')
    const state = getState()
    const agent = (state.agents ?? []).find((item) => item.id === agentId)
    if (!agent || agent.status !== 'published') sendError(res, 409, '这个助理尚未发布或已停用')
    const session = (state.sessions ?? []).find((item) => item.id === sessionId)
    if (!session || session.archivedAt) sendError(res, 409, '会话不存在或已归档')

    // 附件必须是本人上传的文件；文字内容会随本次提问一起交给模型。
    const attachments = []
    for (const rawId of Array.isArray(body.attachmentIds) ? body.attachmentIds.slice(0, 5) : []) {
      const row = getFileRow(String(rawId))
      if (!row || row.owner_id !== user.member_id) continue
      attachments.push({
        id: row.id,
        name: row.name,
        sizeLabel: humanSize(row.size),
        text: fileText(row),
      })
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    const sendEvent = (event, data) => {
      if (res.writableEnded) return
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }
    const controller = new AbortController()
    let finished = false
    const runStartedAt = Date.now()
    res.on('close', () => {
      if (!finished) {
        controller.abort()
        patchRunServer(runId, { status: 'stopped', endedAt: nowISO(), error: '客户端断开，运行已停止' }, user.member_id)
      }
    })
    const keepAlive = setInterval(() => {
      if (!res.writableEnded) res.write(': keepalive\n\n')
    }, 10000)
    try {
      if (runId) patchRunServer(runId, { status: 'running', startedAt: nowISO(), error: undefined }, user.member_id)
      sendEvent('start', { runId, agentId, at: nowISO() })
      const result = await runAgentChat({
        state,
        user,
        agent,
        sessionId,
        prompt,
        history: body.history,
        attachments,
        signal: controller.signal,
        onEvent: ({ event, data }) => sendEvent(event, data),
      })
      // 员工 @ 助理要求“归档/记住”时，由助理把附件提交到知识库审批队列。
      const wantsArchive =
        attachments.length > 0 && /归档|存档|记住|记一下|知识库|保存到/.test(prompt)
      if (wantsArchive) {
        try {
          const doc = proposeKnowledgeFromFile({
            user,
            fileId: attachments[0].id,
            title: attachments[0].name,
            spaceId: (state.knowledge ?? [])[0]?.id,
            approve: user.role === 'admin',
          })
          sendEvent('note', {
            text:
              doc.status === 'ready'
                ? `已把《${doc.fileName}》归档到「${(state.knowledge ?? []).find((space) => space.id === doc.spaceId)?.name ?? '企业知识'}」，助理现在就能引用。`
                : `已把《${doc.fileName}》提交到「${(state.knowledge ?? []).find((space) => space.id === doc.spaceId)?.name ?? '企业知识'}」等待管理员审批，通过后全员可检索；7 天内未审批会自动删除。`,
            docId: doc.id,
          })
        } catch (error) {
          sendEvent('note', { text: `知识归档没有提交成功：${error.message}` })
        }
      }
      const endedAt = nowISO()
      const durationSec = Math.max(1, Math.round((Date.now() - runStartedAt) / 1000))
      const totalTokens = Number(result.usage?.total_tokens || 0)
      const cost = Number((totalTokens * 0.000002).toFixed(4))
      sendEvent('done', {
        usage: result.usage,
        backend: result.backend,
        sources: result.sources,
        finishReason: result.finishReason,
        endedAt,
        cost,
      })
      patchRunServer(
        runId,
        {
          status: 'done',
          endedAt,
          durationSec,
          cost,
          error: undefined,
        },
        user.member_id,
      )
      patchMessageServer(
        body.messageId,
        {
          content: result.text,
          sources: result.sources,
          runId,
        },
        user.member_id,
        runId,
      )
      finished = true
      res.end()
    } catch (error) {
      if (error.name === 'AbortError' || controller.signal.aborted) {
        patchRunServer(runId, { status: 'stopped', endedAt: nowISO(), error: '已由用户停止' }, user.member_id)
        if (!res.writableEnded) sendEvent('error', { error: '运行已停止' })
      } else {
        patchRunServer(runId, { status: 'failed', endedAt: nowISO(), error: error.message }, user.member_id)
        if (!res.writableEnded) sendEvent('error', { error: error.message })
      }
      finished = true
      if (!res.writableEnded) res.end()
    } finally {
      clearInterval(keepAlive)
    }
    return
  }

  // ---- 技能市场（1Panel 式远程应用源）------------------------------------
  if (pathname === '/api/market' && req.method === 'GET') {
    const user = requireUser(req)
    if (!user) sendError(res, 401, '请先登录')
    let entry
    try {
      entry = await loadMarket()
    } catch (error) {
      sendError(res, 502, `技能市场加载失败：${error.message}`)
    }
    sendJson(res, 200, {
      ...entry.market,
      fetchedAt: entry.fetchedAt,
      cached: Boolean(entry.cached),
      stale: Boolean(entry.stale),
      warning: entry.error ?? '',
      source: marketStatus().source,
    })
    return
  }

  if (pathname === '/api/market' && req.method === 'PUT') {
    const user = requireUser(req)
    if (!isAdmin(user)) sendError(res, 403, '需要管理员权限')
    const body = await readJson(req, 16 * 1024)
    const result = setMarketSource(body.source, user.member_id)
    if (!result.ok) sendError(res, 400, result.error)
    sendJson(res, 200, { ok: true, source: marketStatus().source })
    return
  }

  if (pathname === '/api/market/refresh' && req.method === 'POST') {
    const user = requireUser(req)
    if (!isAdmin(user)) sendError(res, 403, '需要管理员权限')
    rateLimit(`market:${user.member_id}`, 6, 60 * 1000)
    let entry
    try {
      entry = await loadMarket({ force: true })
    } catch (error) {
      sendError(res, 502, `刷新失败：${error.message}`)
    }
    sendJson(res, 200, {
      ...entry.market,
      fetchedAt: entry.fetchedAt,
      cached: false,
      warning: '',
      source: marketStatus().source,
    })
    return
  }

  if (pathname === '/api/market/skill' && req.method === 'GET') {
    const user = requireUser(req)
    if (!user) sendError(res, 401, '请先登录')
    const slug = url.searchParams.get('slug') ?? ''
    const result = await fetchSkillContent(slug)
    if (!result.ok) sendError(res, 404, result.error)
    sendJson(res, 200, { slug, content: result.content, url: result.url })
    return
  }

  // ---- 技能安装：落到 Hermes 技能目录 ------------------------------------
  if (pathname === '/api/skills' && req.method === 'GET') {
    const user = requireUser(req)
    if (!user) sendError(res, 401, '请先登录')
    sendJson(res, 200, { installed: listInstalled(), ...skillsRootInfo() })
    return
  }

  if (pathname === '/api/skills/install' && req.method === 'POST') {
    const user = requireUser(req)
    if (!isAdmin(user)) sendError(res, 403, '需要管理员权限')
    rateLimit(`skill-install:${user.member_id}`, 20, 60 * 1000)
    const body = await readJson(req, 8 * 1024)
    const slug = String(body.slug || '').trim()
    if (!slug) sendError(res, 400, '缺少技能 ID')
    const market = await loadMarket()
    const result = await installSkill(slug, { ...market.market, source: marketStatus().source })
    if (!result.ok) sendError(res, 400, result.error)
    sendJson(res, 200, { ok: true, installed: result.installed, root: result.root })
    return
  }

  const skillInstallMatch = /^\/api\/skills\/([A-Za-z0-9._-]{1,64})$/.exec(pathname)
  if (skillInstallMatch && req.method === 'DELETE') {
    const user = requireUser(req)
    if (!isAdmin(user)) sendError(res, 403, '需要管理员权限')
    const result = uninstallSkill(skillInstallMatch[1])
    if (!result.ok) sendError(res, 400, result.error)
    sendJson(res, 200, { ok: true })
    return
  }

  if (pathname === '/api/status' && req.method === 'GET') {
    const user = requireUser(req)
    if (!isAdmin(user)) sendError(res, 403, '需要管理员权限')
    const { revision } = getRawState()
    sendJson(res, 200, {
      revision,
      hermes: getGatewayStatus(),
      model: publicModelConfig(),
      users: countUsers(),
      dataDir: config.dataDir,
      uptimeSec: Math.round(process.uptime()),
    })
    return
  }

  sendError(res, 404, '接口不存在')
}

function patchRunServer(runId, patch, memberId) {
  if (!runId) return
  try {
    updateState((state) => {
      const runs = state.runs ?? []
      const target = runs.find((run) => run.id === runId)
      if (!target || (memberId && target.actorId !== memberId)) return state
      return {
        ...state,
        runs: runs.map((run) => (run.id === runId ? { ...run, ...patch } : run)),
      }
    })
  } catch (error) {
    console.error('patch run failed:', error.message)
  }
}

function patchMessageServer(messageId, patch, memberId, runId) {
  if (!messageId) return
  try {
    updateState((state) => {
      const messages = state.messages ?? []
      const target = messages.find((message) => message.id === messageId)
      if (!target) return state
      const run = (state.runs ?? []).find((item) => item.id === (target.runId || runId))
      const allowed =
        target.authorId === memberId ||
        (run && run.actorId === memberId && target.authorType === 'agent')
      if (!allowed) return state
      return {
        ...state,
        messages: messages.map((message) =>
          message.id === messageId ? { ...message, ...patch } : message,
        ),
      }
    })
  } catch (error) {
    console.error('patch message failed:', error.message)
  }
}

async function handleWebhook(req, res, url) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' })
    return
  }
  const match = /^\/api\/webhooks\/([a-z]+)\/([A-Za-z0-9_-]+)$/.exec(url.pathname)
  if (!match) {
    sendJson(res, 404, { error: 'not_found' })
    return
  }
  const [, kind, connectorId] = match
  const state = getState()
  const connector = (state.connectors ?? []).find((item) => item.id === connectorId)
  if (!connector || connector.kind !== kind) {
    sendJson(res, 404, { error: 'connector_not_found' })
    return
  }
  const raw = (await readBody(req, 1024 * 1024)).toString('utf8')
  const result = acceptWebhook({
    connectorId,
    kind,
    headers: req.headers,
    rawBody: raw,
    url,
  })
  sendJson(res, result.status, result.body)
}

function serveStatic(req, res, url) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    sendJson(res, 405, { error: 'method_not_allowed' })
    return
  }
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    sendJson(res, 400, { error: 'bad_path' })
    return
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html'
  const root = path.resolve(config.publicDir)
  const filePath = path.resolve(root, `.${pathname}`)
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    sendJson(res, 403, { error: 'forbidden' })
    return
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendFile(req, res, filePath)
    return
  }
  const indexPath = path.join(root, 'index.html')
  if (fs.existsSync(indexPath)) {
    sendFile(req, res, indexPath)
  } else {
    sendJson(res, 503, { error: 'frontend_not_built', hint: 'run npm run build' })
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

function sendFile(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const stat = fs.statSync(filePath)
  const immutable = filePath.includes(`${path.sep}assets${path.sep}`) && /\.[0-9a-f]{8,}\./i.test(filePath)
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  fs.createReadStream(filePath).pipe(res)
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

server.listen(config.port, '0.0.0.0', () => {
  console.log(`TeamOS listening on :${config.port}`)
  console.log(`Data: ${config.dataDir}`)
  console.log(`Frontend: ${config.publicDir}`)
  try {
    const removed = sweepExpiredKnowledge()
    if (removed) console.log(`清理过期知识归档 ${removed} 条`)
  } catch (error) {
    console.error('knowledge sweep failed:', error.message)
  }
  setInterval(() => {
    try {
      sweepExpiredKnowledge()
    } catch (error) {
      console.error('knowledge sweep failed:', error.message)
    }
  }, 60 * 60 * 1000).unref()
  initializeGateway()
})

function shutdown(signal) {
  console.log(`${signal} received, shutting down`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 5000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('uncaughtException', (error) => console.error('uncaught exception:', error.stack || error))
process.on('unhandledRejection', (error) => console.error('unhandled rejection:', error?.stack || error))
