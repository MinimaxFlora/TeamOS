export type View = 'workspace' | 'admin'
export type Role = 'admin' | 'member'
export type MemberStatus = 'active' | 'invited' | 'pending' | 'disabled'
export type Risk = 'low' | 'medium' | 'high'

export type AgentIcon =
  | 'sparkles'
  | 'briefcase'
  | 'pen'
  | 'chart'
  | 'file'
  | 'users'
  | 'headset'
  | 'megaphone'
  | 'calculator'
  | 'scale'
  | 'code'
  | 'globe'
  | 'flask'
  | 'palette'

export interface Member {
  id: string
  name: string
  email: string
  jobTitle: string
  department: string
  role: Role
  status: MemberStatus
  color: string
  joinedAt: string
  groupIds: string[]
  bio?: string
}

export type ToolKey =
  | 'file.read'
  | 'file.write'
  | 'web.search'
  | 'knowledge.read'
  | 'message.send'
  | 'shell.run'

export interface ToolDefinition {
  key: ToolKey
  label: string
  description: string
  risk: Risk
}

export interface AgentVersionEntry {
  version: string
  at: string
  note: string
  author: string
}

export interface Agent {
  id: string
  name: string
  title: string
  department: string
  description: string
  responsibilities: string[]
  outOfScope: string
  instructions: string
  tone: string
  escalation: string
  model: {
    provider: string
    id: string
    temperature: number
  }
  skills: string[]
  tools: ToolKey[]
  knowledge: string[]
  groupIds: string[]
  color: string
  icon: AgentIcon
  status: 'published' | 'draft' | 'paused'
  dirty: boolean
  version: string
  createdAt: string
  updatedAt: string
  versions: AgentVersionEntry[]
  templateId?: string
}

export interface SkillChange {
  version: string
  date: string
  note: string
}

export interface Skill {
  id: string
  name: string
  description: string
  category: string
  source: 'official' | 'custom' | 'imported'
  sourceLabel: string
  version: string
  risk: Risk
  status: 'enabled' | 'review' | 'disabled'
  permissions: string[]
  agentIds: string[]
  updatedAt: string
  license: string
  author: string
  changelog: SkillChange[]
  icon: AgentIcon
  /** SKILL.md 正文；导入的技能保留原文，可编辑。 */
  content?: string
  sourceUrl?: string
}

export interface Group {
  id: string
  name: string
  purpose: string
  memberIds: string[]
  agentIds: string[]
  visibility: 'public' | 'private'
  unread: number
  updatedAt: string
  kind: 'group' | 'dm'
  dmAgentId?: string
}

export type AttachmentKind = 'doc' | 'sheet' | 'slides' | 'pdf' | 'image' | 'audio' | 'other'

export interface Attachment {
  id: string
  name: string
  size: string
  kind: AttachmentKind
}

export type RunStatus = 'running' | 'done' | 'failed' | 'stopped'
export type StepState = 'pending' | 'active' | 'done' | 'failed'

export interface RunStep {
  label: string
  detail?: string
  state: StepState
}

export interface Run {
  id: string
  agentId: string
  groupId: string
  sessionId: string
  messageId: string
  prompt: string
  status: RunStatus
  steps: RunStep[]
  startedAt: string
  endedAt?: string
  durationSec?: number
  cost?: number
  actorId: string
  error?: string
}

export interface SourceRef {
  label: string
  meta: string
}

export interface Message {
  id: string
  groupId: string
  sessionId: string
  authorId: string
  authorType: 'human' | 'agent' | 'system'
  content: string
  createdAt: string
  attachments?: Attachment[]
  quotedId?: string
  runId?: string
  feedback?: 'up' | 'down'
  sources?: SourceRef[]
}

export interface ChatSession {
  id: string
  title: string
  summary: string[]
  /** Lightweight memory inherited from the previous archived session. */
  memory?: string[]
  createdAt: string
  archivedAt?: string
  messageCount: number
  tokenEstimate: number
  createdBy?: string
}

export interface KnowledgeSpace {
  id: string
  name: string
  description: string
  restricted: boolean
}

export type KnowledgeDocKind = 'doc' | 'sheet' | 'slides' | 'pdf' | 'link'
export type KnowledgeDocStatus = 'ready' | 'review'

export interface KnowledgeDoc {
  id: string
  spaceId: string
  title: string
  summary: string
  tags: string[]
  kind: KnowledgeDocKind
  size: string
  source: string
  ownerId: string
  restricted: boolean
  status: KnowledgeDocStatus
  updatedAt: string
  /** 归档文件的正文（管理员可编辑）。 */
  content?: string
  fileId?: string
  fileName?: string
  /** 待审批文档的到期时间；超过 7 天未审批会被删除。 */
  expiresAt?: string | null
  approvedAt?: string
  approvedBy?: string
  createdAt?: string
}

export interface MeetingAction {
  id: string
  text: string
  ownerId?: string
  due?: string
  done: boolean
}

export interface MeetingNote {
  id: string
  title: string
  meetingAt: string
  durationMin: number
  participantIds: string[]
  source: 'paste' | 'upload' | 'assistant'
  confidential: boolean
  summary: string[]
  decisions: string[]
  actions: MeetingAction[]
  createdAt: string
  createdBy: string
  /** 转写后的完整文字记录，可编辑。 */
  transcript?: string
  audioFileId?: string
  audioName?: string
}

export type ConnectorKind = 'wecom' | 'feishu' | 'dingtalk' | 'slack' | 'webhook'

export interface Connector {
  id: string
  kind: ConnectorKind
  name: string
  description: string
  status: 'connected' | 'disconnected'
  /** Masked endpoint only. The prototype never persists raw webhook URLs. */
  endpointHint: string
  secretSet: boolean
  /** Masked secret hint. Raw secrets are never stored or shown. */
  secretHint: string
  signature: boolean
  scopes: string[]
  events: number
  lastEventAt?: string
  lastTest?: {
    at: string
    ok: boolean
    status: number
    latencyMs: number
    message: string
  }
  createdAt: string
}

export interface Template {
  id: string
  name: string
  defaultName: string
  category: string
  tagline: string
  description: string
  responsibilities: string[]
  skills: string[]
  instructions: string
  tone: string
  tools: ToolKey[]
  color: string
  icon: AgentIcon
  popularity: number
}

export interface Company {
  name: string
  shortName: string
  adminEmail: string
  timezone: string
  plan: string
  deployment: string
  createdAt: string
  /** 管理员自定义的岗位列表（不同公司各不相同）。 */
  positions?: string[]
  /** 管理员自定义的部门列表。 */
  departments?: string[]
}

export interface AuditEvent {
  id: string
  at: string
  actorId: string
  action: string
  target: string
  detail: string
}

export interface ToastItem {
  id: string
  title: string
  description?: string
  tone: 'default' | 'success' | 'warning' | 'danger'
}

export interface AppState {
  company: Company
  members: Member[]
  agents: Agent[]
  skills: Skill[]
  groups: Group[]
  sessions: ChatSession[]
  activeSessionId: string
  messages: Message[]
  runs: Run[]
  knowledge: KnowledgeSpace[]
  knowledgeDocs: KnowledgeDoc[]
  meetings: MeetingNote[]
  connectors: Connector[]
  audit: AuditEvent[]
  currentUserId: string | null
}
