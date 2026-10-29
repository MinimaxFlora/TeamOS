import { getRawState, getState, listUsers, saveState, updateState } from './db.mjs'
import { newId } from './auth.mjs'

export const COMPANY_ROOM_ID = 'g_all'

export function nowISO() {
  return new Date().toISOString()
}

export function stateForUser(user) {
  const state = getState()
  state.currentUserId = user?.member_id ?? null
  if (!user) return state
  const memberId = user.member_id
  const admin = user.role === 'admin'
  if (!admin) {
    state.audit = []
    state.connectors = []
    state.meetings = (state.meetings ?? []).filter(
      (meeting) => !meeting.confidential || meeting.participantIds.includes(memberId),
    )
    state.knowledgeDocs = (state.knowledgeDocs ?? []).filter(
      // 待审批的归档只有提交人能看到；已审批的受限文档也只给作者。
      (doc) => doc.ownerId === memberId || (doc.status === 'ready' && !doc.restricted),
    )
    state.runs = (state.runs ?? []).filter(
      (run) => run.actorId === memberId || run.status === 'running',
    )
  }
  return state
}

export function makeSession(createdBy, memory = []) {
  return {
    id: newId('sess'),
    title: '新的会话',
    summary: [],
    memory,
    createdAt: nowISO(),
    messageCount: 1,
    tokenEstimate: 0,
    createdBy,
  }
}

export function bootstrapFirstAdmin(state, { member, companyName }) {
  const now = nowISO()
  const session = makeSession(member.id)
  const welcome = {
    id: newId('m'),
    groupId: COMPANY_ROOM_ID,
    sessionId: session.id,
    authorId: 'system',
    authorType: 'system',
    content: `${member.name}，欢迎使用 TeamOS。先让管理员在「设置 → 大模型」里填入模型 API Key，然后在公司大厅 @ 助理开始工作。`,
    createdAt: now,
  }
  const agents = (state.agents ?? []).map((agent) => ({
    ...agent,
    groupIds: agent.status === 'published' ? [COMPANY_ROOM_ID] : [],
  }))
  return {
    ...state,
    company: {
      ...state.company,
      name: companyName || '我的公司',
      shortName: '公司',
      adminEmail: member.email,
      createdAt: now,
    },
    members: [{ ...member, groupIds: [COMPANY_ROOM_ID] }],
    agents,
    groups: [
      {
        id: COMPANY_ROOM_ID,
        name: '公司大厅',
        purpose: '全员',
        memberIds: [member.id],
        agentIds: agents.filter((agent) => agent.status === 'published').map((agent) => agent.id),
        visibility: 'public',
        unread: 0,
        updatedAt: now,
        kind: 'group',
      },
    ],
    sessions: [session],
    activeSessionId: session.id,
    messages: [welcome],
    runs: [],
    meetings: [],
    audit: [
      {
        id: newId('au'),
        at: now,
        actorId: member.id,
        action: '创建公司实例',
        target: member.name,
        detail: '首位管理员完成注册，演示成员与对话已清空',
      },
    ],
    currentUserId: member.id,
  }
}

const ADMIN_ONLY_KEYS = [ // agents / skills 现在由成员按 ownerId 自助维护
  'company',
  'agents',
  'skills',
  'knowledge',
  'knowledgeDocs',
  'connectors',
  'audit',
]

export function mergeMemberState(serverState, incoming, user) {
  const memberId = user.member_id
  const next = { ...serverState }
  const serverRuns = new Map((serverState.runs ?? []).map((run) => [run.id, run]))
  const incomingRuns = new Map(
    (Array.isArray(incoming.runs) ? incoming.runs : [])
      .filter((run) => run?.id && run.actorId === memberId)
      .map((run) => [run.id, run]),
  )
  const ownsRun = (runId) => incomingRuns.has(runId) || serverRuns.get(runId)?.actorId === memberId

  const sessions = new Map((serverState.sessions ?? []).map((session) => [session.id, session]))
  for (const session of Array.isArray(incoming.sessions) ? incoming.sessions : []) {
    if (!session?.id) continue
    const current = sessions.get(session.id)
    if (!current) {
      if (session.createdBy === memberId) sessions.set(session.id, session)
      continue
    }
    const isSharedActive = session.id === serverState.activeSessionId
    if (current.createdBy !== memberId && !isSharedActive) continue
    sessions.set(session.id, {
      ...current,
      title: safeText(session.title, current.title, 80),
      summary: Array.isArray(session.summary) ? session.summary.slice(0, 20) : current.summary,
      memory: Array.isArray(session.memory) ? session.memory.slice(0, 50) : current.memory,
      archivedAt: typeof session.archivedAt === 'string' ? session.archivedAt : current.archivedAt,
      messageCount: Number.isFinite(session.messageCount) ? session.messageCount : current.messageCount,
      tokenEstimate: Number.isFinite(session.tokenEstimate) ? session.tokenEstimate : current.tokenEstimate,
    })
  }
  next.sessions = [...sessions.values()]

  const messages = new Map((serverState.messages ?? []).map((message) => [message.id, message]))
  for (const message of Array.isArray(incoming.messages) ? incoming.messages : []) {
    if (!message?.id || messages.has(message.id)) continue
    const isOwnHuman = message.authorType === 'human' && message.authorId === memberId
    const isOwnAgent = message.authorType === 'agent' && message.runId && ownsRun(message.runId)
    const ownSession = sessions.get(message.sessionId)
    const isOwnSystem =
      message.authorType === 'system' &&
      message.authorId === 'system' &&
      Boolean(ownSession) &&
      (ownSession.createdBy === memberId || ownSession.id === next.activeSessionId)
    if (isOwnHuman || isOwnAgent || isOwnSystem) messages.set(message.id, message)
  }
  next.messages = [...messages.values()].slice(-5000)

  // 员工可以维护自己名下的助理（ownerId === 自己），管理员建的公共助理只读。
  const agents = new Map((serverState.agents ?? []).map((agent) => [agent.id, agent]))
  const incomingAgentIds = new Set()
  for (const agent of Array.isArray(incoming.agents) ? incoming.agents : []) {
    if (!agent?.id) continue
    incomingAgentIds.add(agent.id)
    const current = agents.get(agent.id)
    if (!current) {
      if (agent.ownerId !== memberId) continue
      agents.set(agent.id, {
        ...agent,
        ownerId: memberId,
        visibility: agent.visibility === 'company' ? 'company' : 'private',
        status: agent.status === 'published' ? 'published' : 'draft',
      })
      continue
    }
    if (current.ownerId !== memberId) continue
    agents.set(agent.id, {
      ...current,
      name: safeText(agent.name, current.name, 40),
      title: safeText(agent.title, current.title, 40),
      department: safeText(agent.department, current.department, 40),
      description: safeText(agent.description, current.description, 600),
      responsibilities: Array.isArray(agent.responsibilities)
        ? agent.responsibilities.slice(0, 12)
        : current.responsibilities,
      instructions: safeText(agent.instructions, current.instructions, 4000),
      tone: safeText(agent.tone, current.tone, 200),
      skills: Array.isArray(agent.skills) ? agent.skills.slice(0, 24) : current.skills,
      tools: Array.isArray(agent.tools) ? agent.tools.slice(0, 12) : current.tools,
      knowledge: Array.isArray(agent.knowledge) ? agent.knowledge.slice(0, 12) : current.knowledge,
      visibility: agent.visibility === 'company' ? 'company' : 'private',
      status: agent.status === 'published' ? 'published' : current.status,
      updatedAt: nowISO(),
    })
  }
  for (const [id, agent] of agents) {
    if (agent.ownerId === memberId && !incomingAgentIds.has(id)) agents.delete(id)
  }
  next.agents = [...agents.values()]

  // 员工自己安装的技能：只能维护 ownerId === 自己的记录。
  const skills = new Map((serverState.skills ?? []).map((skill) => [skill.id, skill]))
  const incomingSkillIds = new Set()
  for (const skill of Array.isArray(incoming.skills) ? incoming.skills : []) {
    if (!skill?.id) continue
    incomingSkillIds.add(skill.id)
    const current = skills.get(skill.id)
    if (!current) {
      if (skill.ownerId !== memberId) continue
      skills.set(skill.id, { ...skill, status: 'enabled' })
      continue
    }
    if (current.ownerId !== memberId) continue
    skills.set(skill.id, {
      ...current,
      status: skill.status === 'disabled' ? 'disabled' : 'enabled',
      updatedAt: nowISO(),
    })
  }
  for (const [id, skill] of skills) {
    if (skill.ownerId === memberId && !incomingSkillIds.has(id)) skills.delete(id)
  }
  next.skills = [...skills.values()]

  const runs = new Map((serverState.runs ?? []).map((run) => [run.id, run]))
  for (const run of Array.isArray(incoming.runs) ? incoming.runs : []) {
    if (!run?.id || run.actorId !== memberId) continue
    const current = runs.get(run.id)
    if (!current) {
      runs.set(run.id, run)
      continue
    }
    runs.set(run.id, {
      ...current,
      status: typeof run.status === 'string' ? run.status : current.status,
      steps: Array.isArray(run.steps) ? run.steps.slice(-30) : current.steps,
      error: typeof run.error === 'string' ? run.error.slice(0, 500) : current.error,
      endedAt: typeof run.endedAt === 'string' ? run.endedAt : current.endedAt,
      durationSec: Number.isFinite(run.durationSec) ? run.durationSec : current.durationSec,
      cost: Number.isFinite(run.cost) ? run.cost : current.cost,
    })
  }
  next.runs = [...runs.values()]

  const meetings = new Map((serverState.meetings ?? []).map((meeting) => [meeting.id, meeting]))
  for (const meeting of Array.isArray(incoming.meetings) ? incoming.meetings : []) {
    if (!meeting?.id || meetings.has(meeting.id)) continue
    if ((meeting.participantIds ?? []).includes(memberId) || meeting.createdBy === memberId) {
      meetings.set(meeting.id, meeting)
    }
  }
  next.meetings = [...meetings.values()]

  if (typeof incoming.activeSessionId === 'string') {
    const active = next.sessions.find((session) => session.id === incoming.activeSessionId)
    if (active && !active.archivedAt) next.activeSessionId = incoming.activeSessionId
  }
  next.members = (serverState.members ?? []).map((member) => {
    if (member.id !== memberId) return member
    const patch = (incoming.members ?? []).find((item) => item.id === memberId) ?? {}
    return {
      ...member,
      jobTitle: safeText(patch.jobTitle, member.jobTitle, 30),
      department: safeText(patch.department, member.department, 30),
      bio: safeText(patch.bio, member.bio, 300),
    }
  })
  for (const key of ADMIN_ONLY_KEYS) next[key] = serverState[key]
  next.currentUserId = memberId
  return next
}

export function enforceUsers(state) {
  const users = listUsers()
  const members = Array.isArray(state.members) ? state.members : []
  const byId = new Map(members.map((member) => [member.id, member]))
  let nextMembers = members
  for (const user of users) {
    const existing = byId.get(user.member_id)
    if (!existing) {
      const member = {
        id: user.member_id,
        name: user.email.split('@')[0] || '成员',
        email: user.email,
        jobTitle: '成员',
        department: '未分组',
        role: user.role,
        status: user.status === 'invited' ? 'invited' : 'active',
        color: '#56657a',
        joinedAt: nowISO(),
        groupIds: [COMPANY_ROOM_ID],
      }
      nextMembers = [...nextMembers, member]
      byId.set(member.id, member)
    } else {
      nextMembers = nextMembers.map((member) =>
        member.id === user.member_id
          ? {
              ...member,
              email: user.email,
              role: user.role,
              status: user.status === 'invited' ? 'invited' : member.status,
            }
          : member,
      )
    }
  }
  return { ...state, members: nextMembers }
}

export function sanitizeIncomingState(incoming) {
  if (!incoming || typeof incoming !== 'object') throw new Error('状态格式不正确')
  const clone = structuredClone(incoming)
  delete clone.currentUserId
  if (Array.isArray(clone.members)) {
    clone.members = clone.members.map((member) => {
      const clean = { ...member }
      delete clean.password
      delete clean.passwordHash
      return clean
    })
  }
  return clone
}

export function saveAdminState(incoming, user) {
  const clean = sanitizeIncomingState(incoming)
  clean.currentUserId = user.member_id
  clean.audit = Array.isArray(clean.audit) ? clean.audit.slice(0, 2000) : []
  clean.messages = Array.isArray(clean.messages) ? clean.messages.slice(-5000) : []
  clean.connectors = Array.isArray(clean.connectors) ? clean.connectors : []
  const revision = saveState(enforceUsers(clean), { syncConnectors: true })
  return { state: stateForUser(user), revision }
}

export function saveMemberState(incoming, user) {
  const { state: serverState } = getRawState()
  const merged = mergeMemberState(serverState, sanitizeIncomingState(incoming), user)
  merged.messages = (merged.messages ?? []).slice(-5000)
  merged.meetings = (merged.meetings ?? []).slice(0, 1000)
  const revision = saveState(enforceUsers(merged))
  return { state: stateForUser(user), revision }
}

export function patchRun(runId, patch) {
  updateState((state) => {
    const runs = state.runs ?? []
    const run = runs.find((item) => item.id === runId)
    if (!run) return state
    return {
      ...state,
      runs: runs.map((item) => (item.id === runId ? { ...item, ...patch } : item)),
    }
  })
}

export function appendAudit(state, event) {
  return {
    ...state,
    audit: [{ id: newId('au'), at: nowISO(), ...event }, ...(state.audit ?? [])].slice(0, 2000),
  }
}

function safeText(value, fallback, max) {
  if (typeof value !== 'string') return fallback ?? ''
  return value.trim().slice(0, max)
}
