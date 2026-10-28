import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import { config, ROOT } from './config.mjs'
import {
  countUsers,
  createUser,
  deleteUserSessions,
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
  publicModelConfig,
  restartGateway,
  saveModelConfig,
  testModel,
} from './hermes.mjs'
import { runAgentChat, testAgentReply } from './chat.mjs'
import { summarizeTranscriptModel } from './minutes.mjs'
import { acceptWebhook, extractEvent } from './webhooks.mjs'
import { hashPassword, maskSecret, randomToken, sanitizeEmail, verifyPassword } from './security.mjs'

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

function validateRegistration(body) {
  const name = String(body.name || '').trim()
  const email = sanitizeEmail(body.email)
  const password = String(body.password || '')
  const jobTitle = String(body.jobTitle || '').trim()
  const department = String(body.department || '未分组').trim()
  if (!name || name.length > 30) throw Object.assign(new Error('请填写姓名'), { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('邮箱格式不正确'), { status: 400 })
  if (password.length < 8 || password.length > 200) {
    throw Object.assign(new Error('密码至少 8 位'), { status: 400 })
  }
  if (!jobTitle || jobTitle.length > 40) throw Object.assign(new Error('请填写岗位名称'), { status: 400 })
  return { name, email, password, jobTitle, department: department.slice(0, 40) }
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
    const member = memberObject({
      id: memberId,
      name: input.name,
      email: input.email,
      jobTitle: input.jobTitle,
      department: input.department,
      role,
      status: 'active',
      color: AVATAR_COLORS[countUsers() % AVATAR_COLORS.length],
      groupIds: ['g_all'],
    })
    createUser({
      id: userId,
      memberId,
      email: input.email,
      passwordHash: hashPassword(input.password),
      role,
      status: 'active',
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
        groups: (state.groups ?? []).map((group) =>
          group.id === 'g_all'
            ? { ...group, memberIds: [...new Set([...(group.memberIds ?? []), memberId])], updatedAt: nowISO() }
            : group,
        ),
        audit: [
          {
            id: newId('au'),
            at: nowISO(),
            actorId: memberId,
            action: '员工自助注册',
            target: `${member.name} · ${member.jobTitle}`,
            detail: `加入 ${member.department}`,
          },
          ...(state.audit ?? []),
        ],
      }
    }
    saveState(next)
    if (first) resetConnectorRuntime()
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
      const raw = JSON.stringify({
        event_id: `test_${Date.now()}`,
        event_type: 'teamos.test',
        message: 'TeamOS 本地测试事件',
      })
      const event = extractEvent(raw)
      const { insertWebhookEvent } = await import('./db.mjs')
      insertWebhookEvent({
        connectorId: id,
        eventId: event.eventId,
        eventType: event.eventType,
        payload: event.payload,
        signatureValid: true,
      })
      const nextState = getState()
      sendJson(res, 200, {
        ok: true,
        eventId: event.eventId,
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
    if (body.jobTitle !== undefined) patch.jobTitle = String(body.jobTitle).trim().slice(0, 40)
    if (body.department !== undefined) patch.department = String(body.department).trim().slice(0, 40)
    if (body.bio !== undefined) patch.bio = String(body.bio).trim().slice(0, 400)
    if (body.role !== undefined) {
      if (!['admin', 'member'].includes(body.role)) sendError(res, 400, '角色不合法')
      patch.role = body.role
    }
    if (body.status !== undefined) {
      if (!['active', 'invited', 'disabled'].includes(body.status)) sendError(res, 400, '状态不合法')
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
    updateState((state) => ({
      ...state,
      members: (state.members ?? []).map((item) =>
        item.id === memberId ? { ...item, ...patch } : item,
      ),
      audit: [
        {
          id: newId('au'),
          at: nowISO(),
          actorId: user.member_id,
          action: '修改成员信息',
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
        signal: controller.signal,
        onEvent: ({ event, data }) => sendEvent(event, data),
      })
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
