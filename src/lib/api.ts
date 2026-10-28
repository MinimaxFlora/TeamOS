import type { Agent, AppState, Member, SourceRef } from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface SessionUser {
  id: string
  memberId: string
  email: string
  role: 'admin' | 'member'
  status: 'active' | 'invited' | 'disabled'
  member?: Member
}

export interface AuthResponse {
  authenticated: boolean
  setupRequired?: boolean
  pending?: boolean
  message?: string
  user?: SessionUser
  state?: AppState
  revision?: number
}

export interface GatewayStatus {
  status: string
  startedAt: string | null
  lastError: string | null
  backend: string | null
  baseUrl: string
  pid: number | null
  autoStart: boolean
}

export interface ModelConfig {
  provider: string
  model: string
  baseUrl: string
  keySet: boolean
  keyHint: string
  updatedAt: string | null
  hermes?: GatewayStatus
}

export interface InviteResult {
  ok: boolean
  temporaryPassword: string
  member: Member
  state?: AppState
  revision?: number
}

export interface MeetingSummaryResult {
  summary: string[]
  decisions: string[]
  actions: { text: string; ownerId?: string; due?: string }[]
  modelUsed: boolean
  backend?: string
  warning?: string
}

export interface AgentTestResult {
  ok: boolean
  agentId: string
  reply: string
  backend: string
  latencyMs: number
  sources: SourceRef[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null
}

export interface ChatDonePayload {
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null
  backend?: string
  sources?: SourceRef[]
  finishReason?: string | null
  endedAt?: string
  cost?: number
}

export interface UploadedFile {
  id: string
  name: string
  mime: string
  size: number
  kind: 'image' | 'doc' | 'pdf' | 'sheet' | 'slides' | 'audio' | 'other'
  purpose: 'chat' | 'knowledge' | 'audio'
  ownerId: string
  hasText: boolean
  createdAt: string
}

export interface KnowledgeDocResult {
  ok: boolean
  doc?: KnowledgeDocLike
  state?: AppState
  revision?: number
}

export interface KnowledgeDocLike {
  id: string
  spaceId: string
  title: string
  summary: string
  content?: string
  tags: string[]
  status?: string
  fileId?: string
  fileName?: string
  expiresAt?: string | null
  [key: string]: unknown
}

const JSON_HEADERS = { 'content-type': 'application/json' }

async function uploadRaw(path: string, file: Blob, name: string): Promise<UploadedFile> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      'content-type': file.type || 'application/octet-stream',
    },
    body: file,
  })
  const text = await response.text()
  let payload: { error?: string; file?: UploadedFile } | null = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  if (!response.ok || !payload?.file) {
    throw new ApiError(response.status, payload?.error || `上传失败（${response.status}）${name ? `：${name}` : ''}`)
  }
  return payload.file
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? JSON_HEADERS : {}),
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }
  if (!response.ok) {
    const message =
      (payload as { error?: string } | null)?.error ||
      (response.status === 401
        ? '登录已过期，请重新登录'
        : response.status === 403
          ? '没有权限执行这个操作'
          : `请求失败（${response.status}）`)
    throw new ApiError(response.status, message)
  }
  return payload as T
}

export const api = {
  me: () => request<AuthResponse>('/api/auth/me'),

  login: (email: string, password: string) =>
    request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (input: { account: string; password: string }) =>
    request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  getState: () => request<{ state: AppState; revision: number }>('/api/state'),

  putState: (state: AppState) =>
    request<{ state: AppState; revision: number }>('/api/state', {
      method: 'PUT',
      body: JSON.stringify({ state }),
    }),

  getModel: () => request<ModelConfig>('/api/model'),

  saveModel: (input: {
    provider: string
    model: string
    baseUrl: string
    apiKey: string
  }) =>
    request<{ ok: boolean; model: ModelConfig; hermes: GatewayStatus; restarting: boolean }>(
      '/api/model',
      { method: 'PUT', body: JSON.stringify(input) },
    ),

  testModel: () =>
    request<{ ok: boolean; backend: string; latencyMs: number; reply: string; gateway: GatewayStatus }>(
      '/api/model/test',
      { method: 'POST' },
    ),

  testAgent: (agent: Agent, prompt: string) =>
    request<AgentTestResult>('/api/agents/test', {
      method: 'POST',
      body: JSON.stringify({ agent, prompt }),
    }),

  invite: (input: {
    name: string
    email: string
    jobTitle: string
    department: string
    role: 'admin' | 'member'
  }) =>
    request<InviteResult>('/api/members/invite', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  patchMember: (
    id: string,
    patch: Partial<Pick<Member, 'name' | 'jobTitle' | 'department' | 'role' | 'status' | 'bio'>>,
  ) =>
    request<{ ok: boolean; member: Member; state: AppState; revision: number }>(
      `/api/members/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    ),

  deleteMember: (id: string) =>
    request<{ ok: boolean; state: AppState; revision: number }>(
      `/api/members/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),

  modelCatalog: (input: { provider: string; baseUrl?: string; apiKey?: string }) =>
    request<{ ok: boolean; models: string[] }>('/api/model/catalog', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  uploadFile: (file: Blob, name: string, purpose: 'chat' | 'knowledge' | 'audio') =>
    uploadRaw(
      `/api/files?purpose=${purpose}&name=${encodeURIComponent(name)}`,
      file,
      name,
    ),

  fileUrl: (id: string, inline = false) =>
    `/api/files/${encodeURIComponent(id)}${inline ? '?inline=1' : ''}`,

  downloadFile: async (id: string, name: string) => {
    const response = await fetch(`/api/files/${encodeURIComponent(id)}`, {
      credentials: 'same-origin',
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      let message = `下载失败（${response.status}）`
      try {
        message = JSON.parse(text).error || message
      } catch {
        // keep default
      }
      throw new ApiError(response.status, message)
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  },

  deleteFile: (id: string) =>
    request<{ ok: boolean }>(`/api/files/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  fileText: (id: string) =>
    request<{ ok: boolean; text: string; file: UploadedFile }>(
      `/api/files/${encodeURIComponent(id)}/text`,
    ),

  proposeFile: (id: string, input: { title?: string; summary?: string; spaceId?: string; tags?: string[]; restricted?: boolean }) =>
    request<KnowledgeDocResult>(`/api/files/${encodeURIComponent(id)}/propose`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  transcribeFile: (id: string) =>
    request<{ ok: boolean; text: string; durationSec: number }>(
      `/api/files/${encodeURIComponent(id)}/transcribe`,
      { method: 'POST' },
    ),

  approveKnowledge: (id: string) =>
    request<{ ok: boolean; state: AppState; revision: number }>(
      `/api/knowledge/${encodeURIComponent(id)}/approve`,
      { method: 'POST' },
    ),

  rejectKnowledge: (id: string) =>
    request<{ ok: boolean; state: AppState; revision: number }>(
      `/api/knowledge/${encodeURIComponent(id)}/reject`,
      { method: 'POST' },
    ),

  patchKnowledge: (
    id: string,
    patch: { title?: string; summary?: string; content?: string; tags?: string[]; restricted?: boolean; spaceId?: string },
  ) =>
    request<{ ok: boolean; doc: KnowledgeDocLike; state: AppState; revision: number }>(
      `/api/knowledge/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    ),

  summarizeMeeting: (input: {
    title: string
    transcript: string
    participantIds: string[]
  }) =>
    request<MeetingSummaryResult>('/api/meetings/summarize', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateConnector: (
    id: string,
    input: {
      endpoint?: string
      secret?: string
      status?: 'connected' | 'disconnected'
      signature?: boolean
      scopes?: string[]
    },
  ) =>
    request<{ ok: boolean; state: AppState; revision: number }>(`/api/connectors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  testConnector: (id: string) =>
    request<{
      ok: boolean
      delivery: { ok: boolean; status: number; latencyMs: number; message: string }
      state: AppState
      revision: number
    }>(`/api/connectors/${id}/test`, { method: 'POST' }),

  connectorEvents: (id: string) =>
    request<{
      events: {
        id: string
        connector_id: string
        event_id: string
        event_type: string | null
        signature_valid: number
        received_at: string
      }[]
    }>(`/api/connectors/${id}/events`),

  status: () =>
    request<{
      revision: number
      hermes: GatewayStatus
      model: ModelConfig
      users: number
      dataDir: string
      uptimeSec: number
    }>('/api/status'),
}

export interface ChatStreamHandlers {
  onStart?: (data: { runId: string; agentId: string; at: string }) => void
  onMeta?: (data: { sources: SourceRef[]; knowledgeCount: number }) => void
  onDelta?: (text: string) => void
  onTool?: (data: { label: string; detail: string }) => void
  onNote?: (data: { text: string; docId?: string }) => void
  onDone?: (data: ChatDonePayload) => void
  onError?: (message: string) => void
}

export async function streamChat(
  input: {
    agentId: string
    sessionId: string
    message: string
    runId?: string
    messageId?: string
    attachmentIds?: string[]
    history?: { role: 'user' | 'assistant'; content: string }[]
  },
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { ...JSON_HEADERS, accept: 'text/event-stream' },
    body: JSON.stringify(input),
    signal,
  })
  if (!response.ok) {
    const text = await response.text()
    let message = `运行失败（${response.status}）`
    try {
      message = JSON.parse(text).error || message
    } catch {
      // keep the status-based message
    }
    throw new ApiError(response.status, message)
  }
  if (!response.body) throw new ApiError(502, '浏览器不支持流式响应')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let eventName = 'message'
  let dataLines: string[] = []

  const dispatch = () => {
    if (!dataLines.length) {
      eventName = 'message'
      return
    }
    const raw = dataLines.join('\n')
    dataLines = []
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      data = raw
    }
    switch (eventName) {
      case 'start':
        handlers.onStart?.(data as { runId: string; agentId: string; at: string })
        break
      case 'meta':
        handlers.onMeta?.(data as { sources: SourceRef[]; knowledgeCount: number })
        break
      case 'delta':
        handlers.onDelta?.((data as { text?: string }).text ?? '')
        break
      case 'tool':
        handlers.onTool?.(data as { label: string; detail: string })
        break
      case 'note':
        handlers.onNote?.(data as { text: string; docId?: string })
        break
      case 'done':
        handlers.onDone?.(data as ChatDonePayload)
        break
      case 'error':
        handlers.onError?.((data as { error?: string }).error ?? '运行失败')
        break
      default:
        break
    }
    eventName = 'message'
  }

  const consumeLine = (line: string) => {
    if (line === '') {
      dispatch()
      return
    }
    if (line.startsWith(':')) return
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
      return
    }
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) consumeLine(line)
  }
  if (buffer) consumeLine(buffer)
  dispatch()
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return '操作失败，请稍后重试'
}
