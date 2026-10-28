import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { config, dataPath, hermesApiKey } from './config.mjs'
import { getSetting, setSetting } from './db.mjs'

const LOG_PATH = dataPath('logs', 'hermes.log')
const MODEL_KEY = 'model_config'
let gateway = null
let gatewayState = { status: 'stopped', startedAt: null, lastError: null, backend: null }
let starting = null

function logLine(line) {
  const stamp = new Date().toISOString()
  fs.appendFileSync(LOG_PATH, `[${stamp}] ${String(line).replace(/\n$/, '')}\n`, { mode: 0o600 })
}

function redact(text) {
  return String(text).replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
}

export function modelConfig() {
  const stored = getSetting(MODEL_KEY) ?? {}
  return {
    provider: stored.provider || '',
    model: stored.model || '',
    baseUrl: stored.baseUrl || '',
    apiKey: stored.apiKey || '',
    updatedAt: stored.updatedAt || null,
  }
}

export function publicModelConfig() {
  const model = modelConfig()
  return {
    provider: model.provider,
    model: model.model,
    baseUrl: model.baseUrl,
    keySet: Boolean(model.apiKey),
    keyHint: model.apiKey ? `•••• ${model.apiKey.slice(-4)}` : '',
    updatedAt: model.updatedAt,
    hermes: getGatewayStatus(),
  }
}

export function saveModelConfig(input) {
  const existing = modelConfig()
  const model = {
    provider: String(input.provider || '').trim().toLowerCase(),
    model: String(input.model || '').trim(),
    baseUrl: String(input.baseUrl || '').trim().replace(/\/+$/, ''),
    apiKey: String(input.apiKey || '').trim() || existing.apiKey,
    updatedAt: new Date().toISOString(),
  }
  if (!model.provider || !model.model) throw new Error('请选择服务商并填写模型名称')
  if (!/^[a-z0-9._-]{2,30}$/.test(model.provider)) throw new Error('服务商名称不合法')
  if (!model.model || model.model.length > 120) throw new Error('模型名称不合法')
  if (model.baseUrl && !/^https?:\/\//.test(model.baseUrl)) throw new Error('Base URL 必须以 http(s):// 开头')
  if (!model.apiKey || model.apiKey.length < 8) throw new Error('请填写有效的 API Key（至少 8 位）')
  setSetting(MODEL_KEY, model)
  return model
}

const PROVIDERS = {
  openai: { env: 'OPENAI_API_KEY', baseEnv: 'OPENAI_BASE_URL', base: 'https://api.openai.com/v1', hermes: 'openai' },
  anthropic: { env: 'ANTHROPIC_API_KEY', baseEnv: 'ANTHROPIC_BASE_URL', base: '', hermes: 'anthropic' },
  openrouter: { env: 'OPENROUTER_API_KEY', baseEnv: 'OPENROUTER_BASE_URL', base: 'https://openrouter.ai/api/v1', hermes: 'openrouter' },
  deepseek: { env: 'DEEPSEEK_API_KEY', baseEnv: 'DEEPSEEK_BASE_URL', base: 'https://api.deepseek.com/v1', hermes: 'deepseek' },
  google: { env: 'GEMINI_API_KEY', baseEnv: 'GEMINI_BASE_URL', base: 'https://generativelanguage.googleapis.com/v1beta/openai', hermes: 'gemini' },
  custom: { env: 'OPENAI_API_KEY', baseEnv: 'OPENAI_BASE_URL', base: '', hermes: 'openai' },
}

function providerInfo(provider) {
  return PROVIDERS[provider] ?? PROVIDERS.custom
}

function providerBase(model) {
  return (model.baseUrl || providerInfo(model.provider).base || '').replace(/\/+$/, '')
}

function updateHermesFiles(model) {
  const info = providerInfo(model.provider)
  fs.mkdirSync(config.hermes.home, { recursive: true })
  const envPath = path.join(config.hermes.home, '.env')
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  const lines = new Map()
  for (const line of existing.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line)
    if (match) lines.set(match[1], match[2])
    else if (line.trim() && !line.trim().startsWith('#')) lines.set(`__raw_${lines.size}`, line)
  }
  for (const [key, value] of lines) {
    if (key === info.env || key === info.baseEnv) lines.delete(key)
  }
  lines.set(info.env, model.apiKey)
  if (model.baseUrl) lines.set(info.baseEnv, model.baseUrl)
  const content = [...lines.entries()]
    .map(([key, value]) => (key.startsWith('__raw_') ? value : `${key}=${value}`))
    .join('\n')
  fs.writeFileSync(envPath, `${content}\n`, { mode: 0o600 })

  if (model.provider === 'google') {
    lines.set('GOOGLE_API_KEY', model.apiKey)
    fs.writeFileSync(
      envPath,
      `${[...lines.entries()].map(([key, value]) => (key.startsWith('__raw_') ? value : `${key}=${value}`)).join('\n')}\n`,
      { mode: 0o600 },
    )
  }

  const target = `${info.hermes}/${model.model}`
  try {
    const result = execFileSyncSafe(config.hermes.bin, ['config', 'set', 'model', target], hermesEnv())
    if (result) logLine(`[model] ${result}`)
  } catch (error) {
    logLine(`[model] failed to set default model: ${error.message}`)
  }
}

function execFileSyncSafe(file, args, env) {
  return execFileSync(file, args, {
    env,
    timeout: 30000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString()
}

function hermesEnv(extra = {}) {
  const model = modelConfig()
  const info = providerInfo(model.provider)
  const env = {
    ...process.env,
    HERMES_HOME: config.hermes.home,
    API_SERVER_ENABLED: 'true',
    API_SERVER_HOST: config.hermes.host,
    API_SERVER_PORT: String(config.hermes.port),
    API_SERVER_KEY: hermesApiKey(),
    HERMES_ALLOW_ROOT_GATEWAY: process.env.HERMES_ALLOW_ROOT_GATEWAY || '1',
    HERMES_GATEWAY_NO_SUPERVISE: '1',
    ...extra,
  }
  if (model.apiKey) env[info.env] = model.apiKey
  if (model.baseUrl) env[info.baseEnv] = model.baseUrl
  if (model.provider === 'google') env.GOOGLE_API_KEY = model.apiKey
  return env
}

export function getGatewayStatus() {
  return {
    ...gatewayState,
    baseUrl: config.hermes.baseUrl,
    pid: gateway?.pid ?? null,
    autoStart: config.hermes.autoStart,
  }
}

export async function hermesHealth(timeoutMs = 1500) {
  try {
    const response = await fetch(`${config.hermes.baseUrl}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function startGateway() {
  if (!config.hermes.autoStart) {
    gatewayState = { ...gatewayState, status: 'disabled', backend: null }
    return false
  }
  if (starting) return starting
  starting = (async () => {
    if (await hermesHealth()) {
      gatewayState = { ...gatewayState, status: 'ready', startedAt: new Date().toISOString(), lastError: null }
      return true
    }
    if (!fs.existsSync(config.hermes.bin)) {
      gatewayState = {
        ...gatewayState,
        status: 'unavailable',
        lastError: `Hermes binary not found: ${config.hermes.bin}`,
      }
      logLine(`[gateway] ${gatewayState.lastError}`)
      return false
    }
    try {
      const model = modelConfig()
      if (model.apiKey) updateHermesFiles(model)
    } catch (error) {
      logLine(`[gateway] model config warning: ${error.message}`)
    }
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
    const out = fs.openSync(LOG_PATH, 'a', 0o600)
    gateway = spawn(config.hermes.bin, ['gateway', 'run'], {
      env: hermesEnv(),
      stdio: ['ignore', out, out],
      detached: false,
    })
    gateway.on('exit', (code, signal) => {
      logLine(`[gateway] exited code=${code} signal=${signal}`)
      gatewayState = {
        ...gatewayState,
        status: code === 0 ? 'stopped' : 'failed',
        lastError: `Hermes gateway exited (${code ?? signal})`,
        pid: null,
      }
      gateway = null
    })
    gatewayState = {
      status: 'starting',
      startedAt: new Date().toISOString(),
      lastError: null,
      backend: null,
      pid: gateway.pid ?? null,
    }
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      if (await hermesHealth()) {
        gatewayState = { ...gatewayState, status: 'ready', lastError: null }
        return true
      }
      await new Promise((resolve) => setTimeout(resolve, 700))
    }
    gatewayState = { ...gatewayState, status: 'failed', lastError: 'Hermes gateway health check timed out' }
    return false
  })()
  try {
    return await starting
  } finally {
    starting = null
  }
}

export async function restartGateway() {
  if (gateway) {
    const child = gateway
    gateway = null
    child.kill('SIGTERM')
    await new Promise((resolve) => setTimeout(resolve, 1200))
    if (!child.killed) child.kill('SIGKILL')
  }
  gatewayState = { ...gatewayState, status: 'stopped' }
  return startGateway()
}

export function stopGateway() {
  if (gateway) {
    gateway.kill('SIGTERM')
    gateway = null
  }
}

async function callHermes(messages, { stream = false, signal, maxTokens, temperature = 0.4, sessionKey } = {}) {
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${hermesApiKey()}`,
  }
  if (sessionKey) headers['x-hermes-session-key'] = sessionKey
  const response = await fetch(`${config.hermes.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: process.env.API_SERVER_MODEL_NAME || 'hermes-agent',
      messages,
      stream,
      max_tokens: maxTokens ?? config.model.systemMaxTokens,
      temperature,
    }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Hermes ${response.status}: ${redact(text).slice(0, 500)}`)
  }
  return response
}

async function callProvider(messages, { stream = false, signal, maxTokens, temperature = 0.4 } = {}) {
  const model = modelConfig()
  const base = providerBase(model)
  if (!base) throw new Error('当前服务商需要配置 Base URL')
  if (!model.apiKey) throw new Error('尚未配置模型 API Key')
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${model.apiKey}`,
  }
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: model.model,
      messages,
      stream,
      max_tokens: maxTokens ?? config.model.systemMaxTokens,
      temperature,
    }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`模型服务 ${response.status}: ${redact(text).slice(0, 500)}`)
  }
  return response
}

export async function pickBackend() {
  if (await hermesHealth(900)) return 'hermes'
  if (modelConfig().apiKey) return 'direct'
  return 'none'
}

export async function openChatStream(messages, options = {}) {
  const backend = await pickBackend()
  if (backend === 'none') {
    throw new Error('还没有配置大模型。请管理员进入「设置 → 大模型」填写服务商、模型和 API Key。')
  }
  const response =
    backend === 'hermes'
      ? await callHermes(messages, { ...options, stream: true })
      : await callProvider(messages, { ...options, stream: true })
  gatewayState = { ...gatewayState, backend }
  return { backend, response }
}

export async function completeText(messages, options = {}) {
  const backend = await pickBackend()
  if (backend === 'none') throw new Error('还没有配置大模型')
  const response =
    backend === 'hermes'
      ? await callHermes(messages, { ...options, stream: false })
      : await callProvider(messages, { ...options, stream: false })
  const data = await response.json()
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('模型返回了空内容')
  }
  return { text, backend, usage: data.usage ?? null }
}

export async function testModel() {
  const started = Date.now()
  const backend = await pickBackend()
  const result = await completeText(
    [
      { role: 'system', content: 'You are a health check. Reply with exactly OK.' },
      { role: 'user', content: 'ping' },
    ],
    { maxTokens: 16, temperature: 0 },
  )
  return {
    ok: true,
    backend,
    latencyMs: Date.now() - started,
    reply: result.text.slice(0, 40),
    gateway: getGatewayStatus(),
  }
}

export function initializeGateway() {
  startGateway().catch((error) => logLine(`[gateway] start failed: ${error.stack || error.message}`))
}
