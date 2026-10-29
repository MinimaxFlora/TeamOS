import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createSeedState, TEMPLATES, TOOL_DEFINITIONS } from './seed'
import { api, ApiError, describeError, streamChat, type AuthResponse, type SessionUser } from './api'
import type {
  Agent,
  AppState,
  Attachment,
  AuditEvent,
  ChatSession,
  Connector,
  Group,
  Member,
  MeetingNote,
  Message,
  Risk,
  Run,
  RunStep,
  Skill,
  ToastItem,
  ToolKey,
} from './types'
import {
  estimateSessionTokens,
  summarizeMessages,
  titleFromMessages,
} from './context'
import { uid } from './utils'

const COMPANY_ROOM_ID = 'g_all'

function nowISO() {
  return new Date().toISOString()
}

/** Keep only the origin and first path segment; webhook tokens never reach state. */
function endpointHint(value: string) {
  try {
    const url = new URL(value.trim())
    const first = url.pathname.split('/').filter(Boolean)[0]
    return first ? `${url.origin}/${first}/…` : `${url.origin}/…`
  } catch {
    return ''
  }
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

function syncMembership(groups: Group[], members: Member[], agents: Agent[]) {
  const nextMembers = members.map((member) => ({
    ...member,
    groupIds: groups.filter((group) => group.memberIds.includes(member.id)).map((group) => group.id),
  }))
  const nextAgents = agents.map((agent) => ({
    ...agent,
    groupIds: groups.filter((group) => group.agentIds.includes(agent.id)).map((group) => group.id),
  }))
  return { members: nextMembers, agents: nextAgents }
}

function makeSteps(skillNames: string[]): RunStep[] {
  const called = skillNames.slice(0, 3).join(' · ') || '基础对话'
  return [
    { label: '读取上下文', detail: '校验会话、助理与企业知识权限', state: 'active' },
    { label: '调用技能', detail: called, state: 'pending' },
    { label: '生成结果', state: 'pending' },
    { label: '整理输出', state: 'pending' },
  ]
}

export interface StoreValue {
  state: AppState
  currentUser: Member | null
  authReady: boolean
  setupRequired: boolean
  toasts: ToastItem[]
  notify: (title: string, options?: { description?: string; tone?: ToastItem['tone'] }) => void
  dismissToast: (id: string) => void
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  register: (input: { account: string; password: string }) => Promise<{
    ok: boolean
    error?: string
    pending?: boolean
    message?: string
  }>
  updateMember: (
    id: string,
    patch: Partial<Pick<Member, 'name' | 'jobTitle' | 'department' | 'role' | 'status' | 'bio'>>,
  ) => Promise<{ ok: boolean; error?: string }>
  deleteMember: (id: string) => Promise<{ ok: boolean; error?: string }>
  inviteMember: (input: {
    name: string
    email: string
    jobTitle: string
    department: string
    role: Member['role']
  }) => Promise<{ ok: boolean; error?: string; temporaryPassword?: string }>
  createAgentFromTemplate: (templateId: string, name: string, department: string) => string | null
  createBlankAgent: (input: { name: string; title: string; department: string }) => string
  updateAgent: (id: string, patch: Partial<Agent>) => void
  validateAgent: (id: string) => { ok: boolean; issues: { level: 'error' | 'warn'; text: string }[] }
  publishAgent: (id: string) => {
    ok: boolean
    issues: { level: 'error' | 'warn'; text: string }[]
  }
  pauseAgent: (id: string) => void
  resumeAgent: (id: string) => void
  deleteAgent: (id: string) => void
  createSkill: (input: {
    name: string
    slug?: string
    description: string
    category: string
    source: 'custom' | 'imported'
    version?: string
    risk?: Risk
    permissions?: string[]
    content?: string
    sourceUrl?: string
    sourceLabel?: string
    author?: string
    license?: string
  }) => string
  updateSkill: (
    id: string,
    patch: Partial<
      Pick<Skill, 'name' | 'description' | 'category' | 'version' | 'risk' | 'permissions' | 'content' | 'sourceUrl'>
    >,
  ) => void
  deleteSkill: (id: string) => void
  setSkillStatus: (id: string, status: Skill['status']) => void
  createKnowledgeDoc: (input: {
    spaceId: string
    title: string
    summary: string
    tags: string[]
    restricted: boolean
    fileId?: string
    content?: string
  }) => Promise<{ ok: boolean; error?: string }>
  approveKnowledgeDoc: (id: string) => Promise<{ ok: boolean; error?: string }>
  deleteKnowledgeDoc: (id: string) => Promise<{ ok: boolean; error?: string }>
  updateKnowledgeDoc: (
    id: string,
    patch: { title?: string; summary?: string; content?: string; tags?: string[]; restricted?: boolean; spaceId?: string },
  ) => Promise<{ ok: boolean; error?: string }>
  createMeeting: (input: {
    title: string
    meetingAt: string
    durationMin: number
    participantIds: string[]
    transcript: string
    confidential: boolean
    audioFileId?: string
    audioName?: string
    source?: MeetingNote['source']
  }) => Promise<{ ok: boolean; error?: string; warning?: string }>
  toggleMeetingAction: (meetingId: string, actionId: string) => void
  deleteMeeting: (id: string) => void
  updateMeeting: (
    id: string,
    patch: {
      title?: string
      transcript?: string
      summary?: string[]
      decisions?: string[]
      actions?: MeetingNote['actions']
    },
  ) => void
  resummarizeMeeting: (
    id: string,
    transcript: string,
  ) => Promise<{ ok: boolean; error?: string; warning?: string; modelUsed?: boolean }>
  updateConnector: (
    id: string,
    patch: Partial<Pick<Connector, 'status' | 'signature' | 'scopes'>> & {
      endpoint?: string
      secret?: string
    },
  ) => Promise<{ ok: boolean; error?: string }>
  testConnector: (id: string) => Promise<{
    ok: boolean
    error?: string
    delivery?: { status: number; latencyMs: number; message: string }
  }>
  sendMessage: (input: {
    content: string
    mentionAgentIds?: string[]
    attachments?: Attachment[]
    quotedId?: string
  }) => void
  archiveAndStartNewSession: () => {
    ok: boolean
    error?: string
    summary?: string[]
    sessionId?: string
  }
  stopRun: (runId: string) => void
  retryRun: (runId: string) => void
  setFeedback: (messageId: string, feedback?: 'up' | 'down') => void
  markGroupRead: (groupId: string) => void
  updateCompany: (patch: Partial<AppState['company']>) => void
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => createSeedState())
  const [authReady, setAuthReady] = useState(false)
  const [setupRequired, setSetupRequired] = useState(false)
  const [authUser, setAuthUser] = useState<SessionUser | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastTimersRef = useRef<Map<string, number>>(new Map())
  const stateRef = useRef(state)
  const syncEnabledRef = useRef(false)
  const skipNextSyncRef = useRef(false)
  const syncTimerRef = useRef<number | undefined>(undefined)
  const savingRef = useRef(false)
  const dirtyRef = useRef(false)
  const abortRef = useRef<Map<string, AbortController>>(new Map())

  useEffect(() => {
    const toastTimers = toastTimersRef.current
    return () => {
      toastTimers.forEach((t) => window.clearTimeout(t))
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current)
      abortRef.current.forEach((controller) => controller.abort())
    }
  }, [])

  const currentUser =
    state.members.find((member) => member.id === state.currentUserId) ?? authUser?.member ?? null

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = toastTimersRef.current.get(id)
    if (timer) window.clearTimeout(timer)
    toastTimersRef.current.delete(id)
  }, [])

  const notify = useCallback<StoreValue['notify']>(
    (title, options) => {
      const id = uid('toast')
      const toast: ToastItem = {
        id,
        title,
        description: options?.description,
        tone: options?.tone ?? 'default',
      }
      setToasts((prev) => [...prev.slice(-2), toast])
      const timer = window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
        toastTimersRef.current.delete(id)
      }, 4200)
      toastTimersRef.current.set(id, timer)
    },
    [],
  )

  const applyAuth = useCallback((response: AuthResponse) => {
    if (!response.user || !response.state) return false
    skipNextSyncRef.current = true
    setAuthUser(response.user)
    setState(response.state)
    stateRef.current = response.state
    syncEnabledRef.current = true
    setSetupRequired(false)
    return true
  }, [])

  const applyServerState = useCallback((next: AppState) => {
    skipNextSyncRef.current = true
    setState(next)
    stateRef.current = next
  }, [])

  const handleSessionExpired = useCallback(() => {
    syncEnabledRef.current = false
    abortRef.current.forEach((controller) => controller.abort())
    abortRef.current.clear()
    setAuthUser(null)
    setState((prev) => ({ ...prev, currentUserId: null }))
  }, [])

  useEffect(() => {
    let cancelled = false
    api
      .me()
      .then((response) => {
        if (cancelled) return
        if (response.authenticated) {
          applyAuth(response)
        } else {
          setSetupRequired(Boolean(response.setupRequired))
          setState((prev) => ({ ...prev, currentUserId: null }))
        }
      })
      .catch(() => {
        if (!cancelled) setSetupRequired(false)
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [applyAuth])

  const flushState = useCallback(async () => {
    if (!syncEnabledRef.current || savingRef.current) return
    const snapshot = stateRef.current
    if (!snapshot.currentUserId) return
    dirtyRef.current = false
    savingRef.current = true
    try {
      await api.putState(snapshot)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleSessionExpired()
      } else {
        dirtyRef.current = true
      }
    } finally {
      savingRef.current = false
      if (dirtyRef.current && syncEnabledRef.current) {
        dirtyRef.current = false
        void flushState()
      }
    }
  }, [handleSessionExpired])

  const scheduleSync = useCallback(() => {
    dirtyRef.current = true
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current)
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = undefined
      void flushState()
    }, 700)
  }, [flushState])

  useEffect(() => {
    stateRef.current = state
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false
      return
    }
    if (syncEnabledRef.current && state.currentUserId) scheduleSync()
  }, [scheduleSync, state])

  const login = useCallback<StoreValue['login']>(
    async (email, password) => {
      try {
        const response = await api.login(email, password)
        if (!applyAuth(response)) return { ok: false, error: '登录响应不完整' }
        notify('欢迎回来', { description: '你已进入 TeamOS 公司大厅。', tone: 'success' })
        return { ok: true }
      } catch (error) {
        return { ok: false, error: describeError(error) }
      }
    },
    [applyAuth, notify],
  )

  const logout = useCallback(async () => {
    abortRef.current.forEach((controller) => controller.abort())
    abortRef.current.clear()
    syncEnabledRef.current = false
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current)
    syncTimerRef.current = undefined
    try {
      await api.logout()
    } catch {
      // The local session is cleared even when the network is unavailable.
    }
    setAuthUser(null)
    setState((prev) => ({ ...prev, currentUserId: null }))
  }, [])

  const register = useCallback<StoreValue['register']>(
    async (input) => {
      try {
        const response = await api.register({
          account: input.account.trim(),
          password: input.password,
        })
        if (response.pending) {
          setSetupRequired(false)
          return {
            ok: false,
            pending: true,
            message: response.message || '注册申请已提交，请等待管理员通过。',
          }
        }
        if (!applyAuth(response)) return { ok: false, error: '注册响应不完整' }
        notify('欢迎加入 TeamOS', {
          description: '你已进入公司大厅，可以开始 @ 助理了。',
          tone: 'success',
        })
        return { ok: true }
      } catch (error) {
        return { ok: false, error: describeError(error) }
      }
    },
    [applyAuth, notify],
  )

  const changePassword = useCallback<StoreValue['changePassword']>(
    async (currentPassword, newPassword) => {
      try {
        await api.changePassword(currentPassword, newPassword)
        notify('密码已更新', { tone: 'success' })
        return { ok: true }
      } catch (error) {
        return { ok: false, error: describeError(error) }
      }
    },
    [notify],
  )

  const pushAudit = useCallback(
    (action: string, target: string, detail: string) => {
      setState((prev) => {
        const actorId = prev.currentUserId ?? 'u_lin'
        const event: AuditEvent = {
          id: uid('au'),
          at: nowISO(),
          actorId,
          action,
          target,
          detail,
        }
        return { ...prev, audit: [event, ...prev.audit] }
      })
    },
    [],
  )


  const updateMember = useCallback<StoreValue['updateMember']>(
    async (id, patch) => {
      try {
        const result = await api.patchMember(id, patch)
        applyServerState(result.state)
        notify('成员信息已更新', { tone: 'success' })
        return { ok: true }
      } catch (error) {
        return { ok: false, error: describeError(error) }
      }
    },
    [applyServerState, notify],
  )

  const deleteMember = useCallback<StoreValue['deleteMember']>(
    async (id) => {
      try {
        const result = await api.deleteMember(id)
        applyServerState(result.state)
        notify('成员记录已删除', { tone: 'success' })
        return { ok: true }
      } catch (error) {
        return { ok: false, error: describeError(error) }
      }
    },
    [applyServerState, notify],
  )

  const inviteMember = useCallback<StoreValue['inviteMember']>(
    async (input) => {
      const email = input.email.trim().toLowerCase()
      if (!input.name.trim() || !email) return { ok: false, error: '请填写姓名和邮箱。' }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: '邮箱格式不正确。' }
      if (state.members.some((m) => m.email.toLowerCase() === email)) {
        return { ok: false, error: '该邮箱已在成员列表中。' }
      }
      try {
        const result = await api.invite({ ...input, email })
        if (result.state) applyServerState(result.state)
        notify('邀请已创建', {
          description: `${result.member.name} 的临时密码已生成，请通过安全渠道转交。首次登录后需修改密码。`,
          tone: 'success',
        })
        return { ok: true, temporaryPassword: result.temporaryPassword }
      } catch (error) {
        return { ok: false, error: describeError(error) }
      }
    },
    [applyServerState, notify, state.members],
  )

  const createAgentFromTemplate = useCallback<StoreValue['createAgentFromTemplate']>(
    (templateId, name, department) => {
      const template = TEMPLATES.find((t) => t.id === templateId)
      if (!template) return null
      const id = uid('a')
      const now = nowISO()
      const enabledSkills = state.skills
        .filter((s) => template.skills.includes(s.id) && s.status === 'enabled')
        .map((s) => s.id)
      const agent: Agent = {
        id,
        name: name.trim() || template.defaultName,
        title: template.name,
        department,
        description: template.description,
        responsibilities: template.responsibilities,
        outOfScope: '',
        instructions: template.instructions.replaceAll('{company}', state.company.name),
        tone: template.tone,
        escalation: '遇到定价、合同、权限变更或数据删除等高风险事项时，先暂停并请公司管理员确认。',
        model: { provider: 'Anthropic', id: 'claude-sonnet-5-5', temperature: 0.4 },
        skills: enabledSkills,
        tools: template.tools,
        knowledge: [],
        groupIds: [],
        color: template.color,
        icon: template.icon,
        status: 'draft',
        dirty: true,
        version: '0.1',
        createdAt: now,
        updatedAt: now,
        templateId: template.id,
        versions: [{ version: '0.1', at: now, note: '从模板创建草稿', author: currentUser?.name ?? '管理员' }],
      }
      setState((prev) => ({ ...prev, agents: [...prev.agents, agent] }))
      pushAudit('创建助理草稿', `${agent.name} · v0.1`, `从「${template.name}」模板创建`)
      return id
    },
    [currentUser?.name, pushAudit, state.company.name, state.skills],
  )

  const createBlankAgent = useCallback<StoreValue['createBlankAgent']>(
    (input) => {
      const id = uid('a')
      const now = nowISO()
      const agent: Agent = {
        id,
        name: input.name.trim() || '新助理',
        title: input.title.trim() || '通用助理',
        department: input.department,
        description: '',
        responsibilities: [],
        outOfScope: '',
        instructions: '你是公司的 AI 助理。先澄清目标与约束，再给出可执行的结论；没有依据时明确说明。',
        tone: '清晰、克制、先结论后依据',
        escalation: '涉及定价、合同、权限变更或数据删除时，暂停并请公司管理员确认。',
        model: { provider: 'Anthropic', id: 'claude-sonnet-5-5', temperature: 0.4 },
        skills: [],
        tools: ['file.read'],
        knowledge: [],
        groupIds: [],
        color: '#4b5b76',
        icon: 'sparkles',
        status: 'draft',
        dirty: true,
        version: '0.1',
        createdAt: now,
        updatedAt: now,
        versions: [{ version: '0.1', at: now, note: '创建空白草稿', author: currentUser?.name ?? '管理员' }],
      }
      setState((prev) => ({ ...prev, agents: [...prev.agents, agent] }))
      pushAudit('创建助理草稿', `${agent.name} · v0.1`, '空白助理')
      return id
    },
    [currentUser?.name, pushAudit],
  )

  const updateAgent = useCallback<StoreValue['updateAgent']>((id, patch) => {
    setState((prev) => {
      const target = prev.agents.find((a) => a.id === id)
      if (!target) return prev
      const now = nowISO()
      const nextAgents = prev.agents.map((a) =>
        a.id === id ? { ...a, ...patch, updatedAt: now, dirty: true } : a,
      )
      let nextSkills = prev.skills
      let nextGroups = prev.groups
      if (patch.skills) {
        const skills = patch.skills
        nextSkills = prev.skills.map((s) => ({
          ...s,
          agentIds: skills.includes(s.id)
            ? unique([...s.agentIds, id])
            : s.agentIds.filter((x) => x !== id),
        }))
      }
        if (patch.groupIds) {
        const groups = patch.groupIds
        nextGroups = prev.groups.map((g) =>
          g.kind === 'dm'
            ? g
            : {
                ...g,
                agentIds: groups.includes(g.id)
                  ? unique([...g.agentIds, id])
                  : g.agentIds.filter((x) => x !== id),
              },
        )
      }
      const synced = syncMembership(nextGroups, prev.members, nextAgents)
      return {
        ...prev,
        agents: synced.agents,
        skills: nextSkills,
        groups: nextGroups,
        members: synced.members,
      }
    })
  }, [])

  const validateAgent = useCallback<StoreValue['validateAgent']>(
    (id) => {
      const agent = state.agents.find((a) => a.id === id)
      const issues: { level: 'error' | 'warn'; text: string }[] = []
      if (!agent) return { ok: false, issues: [{ level: 'error', text: '助理不存在。' }] }
      if (!agent.name.trim()) issues.push({ level: 'error', text: '缺少助理名称。' })
      if (!agent.description.trim()) issues.push({ level: 'error', text: '缺少一句话简介。' })
      if (!agent.instructions.trim()) issues.push({ level: 'error', text: '缺少职责与指令。' })
      if (!agent.model.id) issues.push({ level: 'error', text: '未选择模型。' })
      if (agent.skills.length === 0) issues.push({ level: 'error', text: '尚未绑定任何 Skill。' })
      const pendingSkills = agent.skills
        .map((sid) => state.skills.find((s) => s.id === sid))
        .filter((s) => s && s.status !== 'enabled')
      if (pendingSkills.length > 0) {
        issues.push({
          level: 'error',
          text: `有 ${pendingSkills.length} 个 Skill 仍在审核或已停用，不能随助理发布。`,
        })
      }
      const riskyTools = agent.tools.filter(
        (tool) => TOOL_DEFINITIONS.find((t) => t.key === tool)?.risk === 'high',
      )
      if (riskyTools.length > 0) {
        issues.push({ level: 'warn', text: '包含高风险工具权限，发布后每次调用都会记录审计事件。' })
      }
      return { ok: !issues.some((i) => i.level === 'error'), issues }
    },
    [state.agents, state.skills],
  )

  const publishAgent = useCallback<StoreValue['publishAgent']>(
    (id) => {
      const result = validateAgent(id)
      if (!result.ok) return result
      setState((prev) => {
        const agent = prev.agents.find((a) => a.id === id)
        if (!agent) return prev
        const now = nowISO()
        const [major, minor] = agent.version.split('.').map((n) => Number(n) || 0)
        const nextVersion = agent.status === 'draft' ? '1.0' : `${major}.${minor + 1}`
        return {
          ...prev,
          agents: prev.agents.map((a) =>
            a.id === id
              ? {
                  ...a,
                  status: 'published',
                  dirty: false,
                  version: nextVersion,
                  updatedAt: now,
                  versions: [
                    {
                      version: nextVersion,
                      at: now,
                      note: '发布当前草稿',
                      author: prev.members.find((m) => m.id === prev.currentUserId)?.name ?? '管理员',
                    },
                    ...a.versions,
                  ],
                }
              : a,
          ),
        }
      })
      const agent = state.agents.find((a) => a.id === id)
      if (agent) pushAudit('发布助理', `${agent.name} · ${agent.version}`, '发布当前草稿')
      notify('助理已发布', { description: '员工现在可以在公司大厅里 @ 它。', tone: 'success' })
      return result
    },
    [notify, pushAudit, state.agents, validateAgent],
  )

  const pauseAgent = useCallback<StoreValue['pauseAgent']>(
    (id) => {
      setState((prev) => ({
        ...prev,
        agents: prev.agents.map((a) =>
          a.id === id ? { ...a, status: 'paused', updatedAt: nowISO() } : a,
        ),
      }))
      const agent = state.agents.find((a) => a.id === id)
      if (agent) pushAudit('停用助理', agent.name, '助理不再响应新的 @ 提及')
      notify('助理已停用', { description: '已有运行会正常结束，新任务不会再触发。' })
    },
    [notify, pushAudit, state.agents],
  )

  const resumeAgent = useCallback<StoreValue['resumeAgent']>(
    (id) => {
      setState((prev) => ({
        ...prev,
        agents: prev.agents.map((a) =>
          a.id === id
            ? { ...a, status: a.version === '0.1' ? 'draft' : 'published', updatedAt: nowISO() }
            : a,
        ),
      }))
      notify('助理已恢复', { tone: 'success' })
    },
    [notify],
  )

  const deleteAgent = useCallback<StoreValue['deleteAgent']>(
    (id) => {
      setState((prev) => {
        const agents = prev.agents.filter((a) => a.id !== id)
        const groups = prev.groups.map((g) => ({
          ...g,
          agentIds: g.agentIds.filter((x) => x !== id),
        }))
        const skills = prev.skills.map((s) => ({
          ...s,
          agentIds: s.agentIds.filter((x) => x !== id),
        }))
        const synced = syncMembership(groups, prev.members, agents)
        return { ...prev, agents: synced.agents, groups, skills, members: synced.members }
      })
      notify('草稿已删除')
    },
    [notify],
  )

  const createSkill = useCallback<StoreValue['createSkill']>(
    (input) => {
      const id = uid('s')
      const now = nowISO()
      const skill: Skill = {
        id,
        name: input.name.trim(),
        slug: input.slug,
        description: input.description.trim(),
        category: input.category,
        source: input.source,
        sourceLabel:
          input.sourceLabel ??
          (input.source === 'custom'
            ? `企业自建 · ${currentUser?.name ?? '管理员'}`
            : 'SkillHub 市场 · 手动导入'),
        version: input.version?.trim() || '0.1.0',
        risk: input.risk ?? 'medium',
        status: 'review',
        permissions: input.permissions ?? [],
        agentIds: [],
        updatedAt: now,
        license: input.license || (input.source === 'custom' ? '企业内部' : '待确认'),
        author: input.author || currentUser?.name || '管理员',
        changelog: [{ version: input.version?.trim() || '0.1.0', date: now, note: '导入，等待审批' }],
        icon: 'file',
        content: input.content ?? '',
        sourceUrl: input.sourceUrl,
      }
      setState((prev) => ({ ...prev, skills: [skill, ...prev.skills] }))
      pushAudit('导入 Skill', `${skill.name} · v${skill.version}`, '进入待审核队列')
      notify('已提交审核', { description: 'Skill 通过审核后才能绑定到助理。' })
      return id
    },
    [currentUser?.name, notify, pushAudit],
  )

  const deleteSkill = useCallback<StoreValue['deleteSkill']>(
    (id) => {
      setState((prev) => ({
        ...prev,
        skills: prev.skills.filter((s) => s.id !== id),
        agents: prev.agents.map((a) => ({
          ...a,
          skills: a.skills.filter((sid) => sid !== id),
        })),
      }))
      notify('Skill 已删除', { description: '已同时从所有助理解除绑定。', tone: 'warning' })
    },
    [notify],
  )

  const setSkillStatus = useCallback<StoreValue['setSkillStatus']>(
    (id, status) => {
      setState((prev) => ({
        ...prev,
        skills: prev.skills.map((s) =>
          s.id === id ? { ...s, status, updatedAt: nowISO() } : s,
        ),
      }))
      const skill = state.skills.find((s) => s.id === id)
      if (skill) {
        const label =
          status === 'enabled' ? '启用 Skill' : status === 'disabled' ? '停用 Skill' : '提交 Skill 审核'
        pushAudit(label, `${skill.name} · v${skill.version}`, '状态变更')
      }
      notify(status === 'enabled' ? 'Skill 已启用' : status === 'disabled' ? 'Skill 已停用' : '已提交审核', {
        tone: status === 'disabled' ? 'warning' : 'success',
      })
    },
    [notify, pushAudit, state.skills],
  )

  const updateSkill = useCallback<StoreValue['updateSkill']>(
    (id, patch) => {
      setState((prev) => ({
        ...prev,
        skills: prev.skills.map((skill) =>
          skill.id === id ? { ...skill, ...patch, updatedAt: nowISO() } : skill,
        ),
      }))
      const skill = state.skills.find((item) => item.id === id)
      if (skill) pushAudit('编辑 Skill', skill.name, Object.keys(patch).join('、'))
      notify('Skill 已保存', { tone: 'success' })
    },
    [notify, pushAudit, state.skills],
  )

  const createKnowledgeDoc = useCallback<StoreValue['createKnowledgeDoc']>(
    async (input) => {
      const title = input.title.trim()
      if (!title) return { ok: false, error: '请填写文档标题。' }
      const space = state.knowledge.find((item) => item.id === input.spaceId)
      if (!space) return { ok: false, error: '请选择有效的知识空间。' }
      try {
        let fileId = input.fileId
        if (!fileId) {
          const content = String(input.content ?? '').trim()
          if (!content) return { ok: false, error: '请上传文件，或粘贴文档正文。' }
          const uploaded = await api.uploadFile(
            new Blob([content], { type: 'text/markdown' }),
            `${title}.md`,
            'knowledge',
          )
          fileId = uploaded.id
        }
        const result = await api.proposeFile(fileId, {
          title,
          summary: input.summary.trim(),
          spaceId: space.id,
          tags: input.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 8),
          restricted: input.restricted,
        })
        if (result.state) applyServerState(result.state)
        const approved = result.doc?.status === 'ready'
        notify(approved ? '知识已上传并生效' : '已提交知识审批', {
          description: approved
            ? '助理现在可以在授权范围内引用这份资料。'
            : '管理员通过后，绑定了该空间的助理才能引用这份资料；7 天内未审批会自动删除。',
          tone: approved ? 'success' : 'default',
        })
        return { ok: true }
      } catch (error) {
        return { ok: false, error: describeError(error) }
      }
    },
    [applyServerState, notify, state.knowledge],
  )

  const approveKnowledgeDoc = useCallback<StoreValue['approveKnowledgeDoc']>(
    async (id) => {
      try {
        const result = await api.approveKnowledge(id)
        applyServerState(result.state)
        notify('知识已通过审批', {
          description: '助理现在可以在授权范围内引用这篇文档。',
          tone: 'success',
        })
        return { ok: true }
      } catch (error) {
        return { ok: false, error: describeError(error) }
      }
    },
    [applyServerState, notify],
  )

  const deleteKnowledgeDoc = useCallback<StoreValue['deleteKnowledgeDoc']>(
    async (id) => {
      try {
        const result = await api.rejectKnowledge(id)
        applyServerState(result.state)
        notify('知识文档已删除', {
          description: '原始文件同时从服务器删除（仍被其他已审批文档引用时保留）。',
          tone: 'warning',
        })
        return { ok: true }
      } catch (error) {
        return { ok: false, error: describeError(error) }
      }
    },
    [applyServerState, notify],
  )

  const updateKnowledgeDoc = useCallback<StoreValue['updateKnowledgeDoc']>(
    async (id, patch) => {
      try {
        const result = await api.patchKnowledge(id, patch)
        applyServerState(result.state)
        notify('知识文档已保存', { tone: 'success' })
        return { ok: true }
      } catch (error) {
        return { ok: false, error: describeError(error) }
      }
    },
    [applyServerState, notify],
  )

  const createMeeting = useCallback<StoreValue['createMeeting']>(
    async (input) => {
      const title = input.title.trim()
      if (!title) return { ok: false, error: '请填写会议标题。' }
      const transcript = input.transcript.trim()
      if (!transcript) return { ok: false, error: '请粘贴会议文字记录。' }
      const participants = state.members.filter((member) =>
        input.participantIds.includes(member.id),
      )
      let result
      try {
        result = await api.summarizeMeeting({
          title,
          transcript,
          participantIds: participants.map((member) => member.id),
        })
      } catch (error) {
        return { ok: false, error: describeError(error) }
      }
      const meeting: MeetingNote = {
        id: uid('mt'),
        title,
        meetingAt: input.meetingAt || nowISO(),
        durationMin: input.durationMin > 0 ? input.durationMin : 30,
        participantIds: participants.map((member) => member.id),
        source: input.source ?? (input.audioFileId ? 'upload' : 'paste'),
        confidential: input.confidential,
        summary: result.summary,
        decisions: result.decisions,
        actions: result.actions.map((action) => ({ ...action, id: uid('ma'), done: false })),
        createdAt: nowISO(),
        createdBy: state.currentUserId ?? '',
        transcript,
        audioFileId: input.audioFileId,
        audioName: input.audioName,
      }
      setState((prev) => ({ ...prev, meetings: [meeting, ...prev.meetings] }))
      pushAudit(
        '生成会议纪要',
        meeting.title,
        `${meeting.summary.length} 条摘要，${meeting.decisions.length} 条决议，${meeting.actions.length} 个行动项`,
      )
      const warning = result.modelUsed
        ? undefined
        : result.warning || '模型尚未配置，本次由本地规则提取，建议配置大模型后重新生成。'
      notify(result.modelUsed ? '纪要已生成' : '纪要已生成（本地规则）', {
        description: result.modelUsed
          ? `模型生成了 ${meeting.decisions.length} 条决议、${meeting.actions.length} 个行动项；仅处理你粘贴的文字。`
          : warning,
        tone: result.modelUsed ? 'success' : 'warning',
      })
      return { ok: true, warning }
    },
    [notify, pushAudit, state.currentUserId, state.members],
  )

  const toggleMeetingAction = useCallback<StoreValue['toggleMeetingAction']>(
    (meetingId, actionId) => {
      setState((prev) => ({
        ...prev,
        meetings: prev.meetings.map((meeting) =>
          meeting.id === meetingId
            ? {
                ...meeting,
                actions: meeting.actions.map((action) =>
                  action.id === actionId ? { ...action, done: !action.done } : action,
                ),
              }
            : meeting,
        ),
      }))
    },
    [],
  )

  const deleteMeeting = useCallback<StoreValue['deleteMeeting']>(
    (id) => {
      const meeting = state.meetings.find((item) => item.id === id)
      if (!meeting) return
      setState((prev) => ({ ...prev, meetings: prev.meetings.filter((item) => item.id !== id) }))
      pushAudit('删除会议纪要', meeting.title, '纪要已删除，已生成的行动项不再显示')
      notify('会议纪要已删除', { tone: 'warning' })
    },
    [notify, pushAudit, state.meetings],
  )

  const updateMeeting = useCallback<StoreValue['updateMeeting']>(
    (id, patch) => {
      setState((prev) => ({
        ...prev,
        meetings: prev.meetings.map((meeting) =>
          meeting.id === id ? { ...meeting, ...patch } : meeting,
        ),
      }))
    },
    [],
  )

  const resummarizeMeeting = useCallback<StoreValue['resummarizeMeeting']>(
    async (id, transcript) => {
      const meeting = state.meetings.find((item) => item.id === id)
      if (!meeting) return { ok: false, error: '会议纪要不存在。' }
      const text = transcript.trim()
      if (!text) return { ok: false, error: '转写文字不能为空。' }
      try {
        const result = await api.summarizeMeeting({
          title: meeting.title,
          transcript: text,
          participantIds: meeting.participantIds,
        })
        setState((prev) => ({
          ...prev,
          meetings: prev.meetings.map((item) =>
            item.id === id
              ? {
                  ...item,
                  transcript: text,
                  summary: result.summary,
                  decisions: result.decisions,
                  actions: result.actions.map((action) => ({ ...action, id: uid('ma'), done: false })),
                }
              : item,
          ),
        }))
        pushAudit('重新总结纪要', meeting.title, `${result.summary.length} 条摘要，${result.actions.length} 个行动项`)
        notify(result.modelUsed ? '纪要已重新总结' : '已用本地规则重新总结', {
          description: result.modelUsed
            ? '摘要、决议与行动项已更新，请检查后保存。'
            : result.warning || '模型尚未配置，本次由本地规则提取。',
          tone: result.modelUsed ? 'success' : 'warning',
        })
        return { ok: true, warning: result.warning, modelUsed: result.modelUsed }
      } catch (error) {
        return { ok: false, error: describeError(error) }
      }
    },
    [notify, pushAudit, state.meetings],
  )

  const updateConnector = useCallback<StoreValue['updateConnector']>(
    async (id, patch) => {
      const connector = state.connectors.find((item) => item.id === id)
      if (!connector) return { ok: false, error: '渠道不存在。' }
      const endpoint = patch.endpoint?.trim() ?? ''
      const secret = patch.secret?.trim() ?? ''
      if (endpoint && !endpointHint(endpoint)) {
        return { ok: false, error: 'Webhook 地址格式不正确，请填写完整的 https:// 地址。' }
      }
      if (secret && secret.length < 8) {
        return { ok: false, error: '签名密钥至少 8 位，建议使用随机生成的长密钥。' }
      }
      const enabling = patch.status === 'connected' && connector.status !== 'connected'
      if (enabling && !connector.endpointHint && !endpoint) {
        return { ok: false, error: '请先填写 Webhook 地址。' }
      }
      if (enabling && !connector.secretSet && !secret) {
        return { ok: false, error: '请先配置签名密钥。' }
      }
      if (enabling && !(patch.signature ?? connector.signature)) {
        return { ok: false, error: '启用前必须开启签名校验。' }
      }
      try {
        const result = await api.updateConnector(id, patch)
        applyServerState(result.state)
        pushAudit(
          '更新渠道接入',
          connector.name,
          patch.status === 'connected'
            ? '启用渠道'
            : patch.status === 'disconnected'
              ? '停用渠道'
              : '配置变更（密钥只写不读）',
        )
        notify('渠道配置已保存', {
          description: '密钥加密存储、只写不读，不会在界面或日志中回显。',
          tone: 'success',
        })
        return { ok: true }
      } catch (error) {
        return { ok: false, error: describeError(error) }
      }
    },
    [applyServerState, notify, pushAudit, state.connectors],
  )

  const testConnector = useCallback<StoreValue['testConnector']>(
    async (id) => {
      const connector = state.connectors.find((item) => item.id === id)
      if (!connector) return { ok: false, error: '渠道不存在。' }
      if (connector.status !== 'connected') return { ok: false, error: '请先启用这个渠道。' }
      if (!connector.signature) return { ok: false, error: '请先开启签名校验。' }
      try {
        const result = await api.testConnector(id)
        applyServerState(result.state)
        const delivery = result.delivery
        if (result.ok) {
          pushAudit(
            '渠道连通性测试',
            connector.name,
            `远端 HTTP ${delivery.status}，耗时 ${delivery.latencyMs}ms`,
          )
          notify('测试消息已送达', {
            description: `远端 HTTP ${delivery.status}，耗时 ${delivery.latencyMs}ms。`,
            tone: 'success',
          })
          return { ok: true, delivery }
        }
        pushAudit('渠道连通性测试', connector.name, `投递失败：${delivery.message}`)
        notify('测试消息未送达', {
          description: delivery.message,
          tone: 'warning',
        })
        return { ok: false, error: delivery.message, delivery }
      } catch (error) {
        return { ok: false, error: describeError(error) }
      }
    },
    [applyServerState, notify, pushAudit, state.connectors],
  )

  const runStream = useCallback(
    (
      runId: string,
      messageId: string,
      agent: Agent,
      prompt: string,
      sessionId: string,
      attachmentIds?: string[],
    ) => {
      const controller = new AbortController()
      abortRef.current.set(runId, controller)

      const patchRun = (patch: Partial<Run>) => {
        setState((prev) => ({
          ...prev,
          runs: prev.runs.map((run) => (run.id === runId ? { ...run, ...patch } : run)),
        }))
      }
      const transitionSteps = (phase: 'meta' | 'tool' | 'delta' | 'done', tool?: { label: string; detail?: string }) => {
        setState((prev) => ({
          ...prev,
          runs: prev.runs.map((run) => {
            if (run.id !== runId) return run
            let steps = run.steps
            if (phase === 'done') {
              steps = steps.map((step) => ({ ...step, state: 'done' as const }))
            } else if (phase === 'meta') {
              steps = steps.map((step, index) => ({
                ...step,
                state: index === 0 ? ('done' as const) : index === 1 ? ('active' as const) : ('pending' as const),
              }))
            } else if (phase === 'tool') {
              const cleaned = steps.map((step) =>
                step.state === 'active' ? { ...step, state: 'done' as const } : step,
              )
              const last = cleaned[cleaned.length - 1]
              if (last?.label !== tool?.label || last?.detail !== tool?.detail) {
                cleaned.push({
                  label: tool?.label || '调用工具',
                  detail: tool?.detail,
                  state: 'active' as const,
                })
              }
              steps = cleaned.slice(-14)
            } else {
              const cleaned = steps.map((step) =>
                step.state === 'active' ? { ...step, state: 'done' as const } : step,
              )
              const index = cleaned.findIndex((step) => step.label === '生成结果')
              if (index >= 0) cleaned[index] = { ...cleaned[index], state: 'active' as const }
              else cleaned.push({ label: '生成结果', state: 'active' as const })
              steps = cleaned
            }
            return { ...run, steps }
          }),
        }))
      }

      const uploadedIds = (attachmentIds ?? []).filter((id) => /^f_[A-Za-z0-9]+$/.test(id)).slice(0, 5)

      void streamChat(
        {
          agentId: agent.id,
          sessionId,
          message: prompt,
          runId,
          messageId,
          ...(uploadedIds.length ? { attachmentIds: uploadedIds } : {}),
        },
        {
          onStart: (data) => patchRun({ startedAt: data.at, status: 'running' }),
          onMeta: (data) => {
            setState((prev) => ({
              ...prev,
              messages: prev.messages.map((message) =>
                message.id === messageId ? { ...message, sources: data.sources } : message,
              ),
            }))
            transitionSteps('meta')
          },
          onTool: (data) => {
            transitionSteps('tool', { label: data.label, detail: data.detail })
          },
          onDelta: (text) => {
            if (!text) return
            setState((prev) => ({
              ...prev,
              messages: prev.messages.map((message) =>
                message.id === messageId
                  ? { ...message, content: message.content + text }
                  : message,
              ),
            }))
            transitionSteps('delta')
          },
          onNote: (data) => {
            if (!data.text) return
            setState((prev) => ({
              ...prev,
              messages: [
                ...prev.messages,
                {
                  id: uid('m'),
                  groupId: COMPANY_ROOM_ID,
                  sessionId,
                  authorId: agent.id,
                  authorType: 'system' as const,
                  content: data.text,
                  createdAt: nowISO(),
                },
              ],
            }))
            notify('知识归档', { description: data.text, tone: 'success' })
          },
          onDone: (data) => {
            setState((prev) => {
              const run = prev.runs.find((item) => item.id === runId)
              const endedAt = data.endedAt || nowISO()
              const durationSec = run
                ? Math.max(
                    1,
                    Math.round(
                      (new Date(endedAt).getTime() - new Date(run.startedAt).getTime()) / 1000,
                    ),
                  )
                : undefined
              return {
                ...prev,
                runs: prev.runs.map((item) =>
                  item.id === runId
                    ? {
                        ...item,
                        status: 'done',
                        steps: item.steps.map((step) => ({ ...step, state: 'done' as const })),
                        endedAt,
                        durationSec,
                        cost: data.cost,
                        error: undefined,
                      }
                    : item,
                ),
                messages: prev.messages.map((message) =>
                  message.id === messageId && data.sources
                    ? { ...message, sources: data.sources }
                    : message,
                ),
              }
            })
            abortRef.current.delete(runId)
          },
          onError: (message) => {
            if (controller.signal.aborted) {
              patchRun({ status: 'stopped', endedAt: nowISO(), error: '已由用户停止。' })
              return
            }
            setState((prev) => ({
              ...prev,
              runs: prev.runs.map((run) =>
                run.id === runId
                  ? { ...run, status: 'failed', endedAt: nowISO(), error: message }
                  : run,
              ),
              messages: prev.messages.map((item) =>
                item.id === messageId && !item.content.trim()
                  ? { ...item, content: `运行失败：${message}` }
                  : item,
              ),
            }))
            notify('助理运行失败', { description: `${agent.name}：${message}`, tone: 'danger' })
          },
        },
        controller.signal,
      )
        .catch((error) => {
          if (controller.signal.aborted) {
            patchRun({ status: 'stopped', endedAt: nowISO(), error: '已由用户停止。' })
            return
          }
          const message = describeError(error)
          setState((prev) => ({
            ...prev,
            runs: prev.runs.map((run) =>
              run.id === runId
                ? { ...run, status: 'failed', endedAt: nowISO(), error: message }
                : run,
            ),
            messages: prev.messages.map((item) =>
              item.id === messageId && !item.content.trim()
                ? { ...item, content: `运行失败：${message}` }
                : item,
            ),
          }))
          notify('助理运行失败', { description: `${agent.name}：${message}`, tone: 'danger' })
        })
        .finally(() => {
          if (abortRef.current.get(runId) === controller) abortRef.current.delete(runId)
        })
    },
    [notify],
  )

  const stopRun = useCallback<StoreValue['stopRun']>(
    (runId) => {
      abortRef.current.get(runId)?.abort()
      abortRef.current.delete(runId)
      setState((prev) => {
        const run = prev.runs.find((r) => r.id === runId)
        if (!run || run.status !== 'running') return prev
        const endedAt = nowISO()
        return {
          ...prev,
          runs: prev.runs.map((r) =>
            r.id === runId
              ? { ...r, status: 'stopped', endedAt, error: '已由用户停止。' }
              : r,
          ),
        }
      })
      notify('已停止运行', { description: '本次运行不会产生新的输出。', tone: 'warning' })
    },
    [notify],
  )

  const retryRun = useCallback<StoreValue['retryRun']>(
    (runId) => {
      const run = state.runs.find((r) => r.id === runId)
      if (!run || run.status === 'running') return
      const agent = state.agents.find((a) => a.id === run.agentId)
      if (!agent) return
      const now = nowISO()
      setState((prev) => ({
        ...prev,
        runs: prev.runs.map((r) =>
          r.id === runId
            ? {
                ...r,
                status: 'running',
                error: undefined,
                startedAt: now,
                endedAt: undefined,
                durationSec: undefined,
                cost: undefined,
                steps: makeSteps(agent.skills.map((sid) => prev.skills.find((s) => s.id === sid)?.name ?? sid)),
              }
            : r,
        ),
        messages: prev.messages.map((m) =>
          m.id === run.messageId ? { ...m, content: '', attachments: undefined, sources: undefined } : m,
        ),
      }))
      runStream(run.id, run.messageId, agent, run.prompt, run.sessionId)
      notify('正在重试', { description: `${agent.name} 会重新执行这次任务。` })
    },
    [notify, runStream, state.agents, state.runs, state.skills],
  )

  const sendMessage = useCallback<StoreValue['sendMessage']>(
    (input) => {
      const userId = state.currentUserId
      if (!userId) return
      const content = input.content.trim()
      if (!content) return
      const activeSession = state.sessions.find((session) => session.id === state.activeSessionId)
      if (!activeSession) return
      const now = nowISO()
      const humanId = uid('m')
      const human: Message = {
        id: humanId,
        groupId: COMPANY_ROOM_ID,
        sessionId: activeSession.id,
        authorId: userId,
        authorType: 'human',
        content,
        createdAt: now,
        attachments: input.attachments,
        quotedId: input.quotedId,
      }
      const mentions = unique(input.mentionAgentIds ?? []).slice(0, 2)
      const agentsToRun = mentions
        .map((id) => state.agents.find((a) => a.id === id))
        .filter((a): a is Agent => a?.status === 'published')

      const runs: Run[] = []
      const agentMessages: Message[] = []
      for (const agent of agentsToRun) {
        const runId = uid('r')
        const messageId = uid('m')
        const skillNames = agent.skills.map(
          (sid) => state.skills.find((s) => s.id === sid)?.name ?? sid,
        )
        runs.push({
          id: runId,
          agentId: agent.id,
          groupId: COMPANY_ROOM_ID,
          sessionId: activeSession.id,
          messageId,
          prompt: content,
          status: 'running',
          steps: makeSteps(skillNames),
          startedAt: now,
          actorId: userId,
        })
        agentMessages.push({
          id: messageId,
          groupId: COMPANY_ROOM_ID,
          sessionId: activeSession.id,
          authorId: agent.id,
          authorType: 'agent',
          content: '',
          createdAt: now,
          runId,
        })
      }

      const nextTitle =
        activeSession.title === '新的会话'
          ? titleFromMessages([human])
          : activeSession.title

      const nextState: AppState = {
        ...state,
        messages: [...state.messages, human, ...agentMessages],
        runs: [...state.runs, ...runs],
        sessions: state.sessions.map((session) =>
          session.id === activeSession.id ? { ...session, title: nextTitle } : session,
        ),
        groups: state.groups.map((g) =>
          g.id === COMPANY_ROOM_ID ? { ...g, updatedAt: now, unread: 0 } : g,
        ),
      }
      setState(nextState)
      stateRef.current = nextState

      if (!agentsToRun.length) return

      void (async () => {
        if (syncEnabledRef.current) {
          try {
            await api.putState(nextState)
          } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
              handleSessionExpired()
              return
            }
          }
        }
        agentsToRun.forEach((agent, index) => {
          const run = runs[index]
          runStream(
            run.id,
            run.messageId,
            agent,
            content,
            activeSession.id,
            (input.attachments ?? []).map((attachment) => attachment.id),
          )
        })
      })()
    },
    [handleSessionExpired, runStream, state],
  )

  const archiveAndStartNewSession = useCallback<StoreValue['archiveAndStartNewSession']>(() => {
    const activeSession = state.sessions.find((session) => session.id === state.activeSessionId)
    if (!activeSession) return { ok: false, error: '当前会话不存在。' }
    const sessionMessages = state.messages.filter(
      (message) => message.sessionId === activeSession.id,
    )
    if (!sessionMessages.some((message) => message.authorType !== 'system')) {
      return { ok: false, error: '当前会话还没有可以整理的对话。' }
    }
    const running = state.runs.filter(
      (run) => run.sessionId === activeSession.id && run.status === 'running',
    )
    if (running.length > 0) {
      return { ok: false, error: '还有助理正在执行，请等待完成或先停止运行。' }
    }

    const summary = summarizeMessages(sessionMessages, state.agents, state.members)
    const tokenEstimate = estimateSessionTokens(sessionMessages)
    const now = nowISO()
    const newSession: ChatSession = {
      id: uid('sess'),
      title: '新的会话',
      summary: [],
      memory: [...(activeSession.memory ?? []), ...summary].slice(-6),
      createdAt: now,
      messageCount: 1,
      tokenEstimate: 0,
      createdBy: state.currentUserId ?? undefined,
    }
    const systemMessage: Message = {
      id: uid('m'),
      groupId: COMPANY_ROOM_ID,
      sessionId: newSession.id,
      authorId: 'system',
      authorType: 'system',
      content: `上一会话「${activeSession.title}」已归档：${sessionMessages.length} 条消息压缩为 ${summary.length} 条记忆摘要。新会话从轻量记忆继续，原始记录仍可在历史会话中查看。`,
      createdAt: now,
    }

    setState((prev) => ({
      ...prev,
      sessions: [
        ...prev.sessions.map((session) =>
          session.id === activeSession.id
            ? {
                ...session,
                archivedAt: now,
                summary,
                messageCount: sessionMessages.length,
                tokenEstimate,
              }
            : session,
        ),
        newSession,
      ],
      activeSessionId: newSession.id,
      messages: [...prev.messages, systemMessage],
      groups: prev.groups.map((group) =>
        group.id === COMPANY_ROOM_ID ? { ...group, unread: 0, updatedAt: now } : group,
      ),
      audit: [
        {
          id: uid('au'),
          at: now,
          actorId: prev.currentUserId ?? 'u_lin',
          action: '归档会话记忆',
          target: activeSession.title,
          detail: `归档 ${sessionMessages.length} 条消息，生成 ${summary.length} 条记忆摘要`,
        },
        ...prev.audit,
      ],
    }))

    notify('已归档并开启新会话', {
      description: `${sessionMessages.length} 条消息已压缩为 ${summary.length} 条记忆，上下文已重置。`,
      tone: 'success',
    })
    return { ok: true, summary, sessionId: newSession.id }
  }, [notify, state.agents, state.activeSessionId, state.members, state.messages, state.runs, state.sessions])

  const setFeedback = useCallback<StoreValue['setFeedback']>((messageId, feedback) => {
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((m) =>
        m.id === messageId
          ? { ...m, feedback: m.feedback === feedback ? undefined : feedback }
          : m,
      ),
    }))
  }, [])

  const markGroupRead = useCallback<StoreValue['markGroupRead']>((groupId) => {
    setState((prev) => {
      const group = prev.groups.find((g) => g.id === groupId)
      if (!group || group.unread === 0) return prev
      return {
        ...prev,
        groups: prev.groups.map((g) => (g.id === groupId ? { ...g, unread: 0 } : g)),
      }
    })
  }, [])

  const updateCompany = useCallback<StoreValue['updateCompany']>(
    (patch) => {
      setState((prev) => ({ ...prev, company: { ...prev.company, ...patch } }))
      notify('公司信息已保存', { tone: 'success' })
      pushAudit('更新公司信息', prevCompanyName(patch), '设置变更')
    },
    [notify, pushAudit],
  )

  const value = useMemo<StoreValue>(
    () => ({
      state,
      currentUser,
      authReady,
      setupRequired,
      toasts,
      notify,
      dismissToast,
      login,
      logout,
      register,
      updateMember,
      deleteMember,
      inviteMember,
      createAgentFromTemplate,
      createBlankAgent,
      updateAgent,
      validateAgent,
      publishAgent,
      pauseAgent,
      resumeAgent,
      deleteAgent,
      createSkill,
      deleteSkill,
      setSkillStatus,
      updateSkill,
      createKnowledgeDoc,
      approveKnowledgeDoc,
      deleteKnowledgeDoc,
      updateKnowledgeDoc,
      createMeeting,
      toggleMeetingAction,
      deleteMeeting,
      updateMeeting,
      resummarizeMeeting,
      updateConnector,
      testConnector,
      sendMessage,
      archiveAndStartNewSession,
      stopRun,
      retryRun,
      setFeedback,
      markGroupRead,
      updateCompany,
      changePassword,
    }),
    [
      state,
      currentUser,
      authReady,
      setupRequired,
      toasts,
      notify,
      dismissToast,
      login,
      logout,
      register,
      updateMember,
      deleteMember,
      inviteMember,
      createAgentFromTemplate,
      createBlankAgent,
      updateAgent,
      validateAgent,
      publishAgent,
      pauseAgent,
      resumeAgent,
      deleteAgent,
      createSkill,
      deleteSkill,
      setSkillStatus,
      updateSkill,
      createKnowledgeDoc,
      approveKnowledgeDoc,
      deleteKnowledgeDoc,
      updateKnowledgeDoc,
      createMeeting,
      toggleMeetingAction,
      deleteMeeting,
      updateMeeting,
      resummarizeMeeting,
      updateConnector,
      testConnector,
      sendMessage,
      archiveAndStartNewSession,
      stopRun,
      retryRun,
      setFeedback,
      markGroupRead,
      updateCompany,
      changePassword,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

function prevCompanyName(patch: Partial<AppState['company']>) {
  return patch.name ?? '公司资料'
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}

export type { ToolKey }
