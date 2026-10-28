import type { Agent, Member, Message } from './types'

/** Demo context budget. In production this follows the selected model's window. */
export const CONTEXT_BUDGET = 8000
export const CONTEXT_WARN = 0.7
export const CONTEXT_LIMIT = 0.9

const BASE_CONTEXT_TOKENS = 620

export function estimateTokens(text: string) {
  if (!text) return 0
  const cjk = (text.match(/[㐀-鿿]/g) ?? []).length
  const rest = Math.max(0, text.length - cjk)
  return Math.ceil(cjk + rest / 4)
}

export function estimateMessageTokens(message: Message) {
  const attachments = (message.attachments?.length ?? 0) * 14
  const sources = (message.sources?.length ?? 0) * 9
  return 8 + estimateTokens(message.content) + attachments + sources
}

export function estimateSessionTokens(messages: Message[]) {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0)
}

export function contextUsage(messages: Message[]) {
  const tokens = estimateSessionTokens(messages) + BASE_CONTEXT_TOKENS
  return {
    tokens,
    percent: Math.min(100, Math.round((tokens / CONTEXT_BUDGET) * 100)),
    remaining: Math.max(0, CONTEXT_BUDGET - tokens),
  }
}

export function stripMention(text: string) {
  return text.replace(/^@[^\s]+\s*/, '').trim()
}

function clip(text: string, max = 42) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

export function titleFromMessages(messages: Message[]) {
  const first = messages.find((message) => message.authorType === 'human')
  const text = stripMention(first?.content ?? '')
  return text ? clip(text, 18) : '公司大厅新会话'
}

/**
 * Deterministic, local summary used by the prototype. It only restates what is
 * already in the session — no model call and no invented facts.
 */
export function summarizeMessages(
  messages: Message[],
  agents: Agent[],
  members: Member[],
): string[] {
  const humanMessages = messages.filter((message) => message.authorType === 'human')
  const agentNames = Array.from(
    new Set(
      messages
        .filter((message) => message.authorType === 'agent')
        .map((message) => agents.find((agent) => agent.id === message.authorId)?.name)
        .filter((name): name is string => Boolean(name)),
    ),
  )
  const memberNames = Array.from(
    new Set(
      humanMessages
        .map((message) => members.find((member) => member.id === message.authorId)?.name)
        .filter((name): name is string => Boolean(name)),
    ),
  )
  const files = Array.from(
    new Set(messages.flatMap((message) => (message.attachments ?? []).map((file) => file.name))),
  )
  const runs = messages.filter((message) => message.runId).length
  const asks = humanMessages
    .slice(-3)
    .map((message) => clip(stripMention(message.content), 34))
    .filter(Boolean)

  const summary: string[] = []
  if (asks.length > 0) {
    summary.push(`讨论：${asks.join('；')}`)
  }
  if (files.length > 0) {
    summary.push(`产出：${files.slice(0, 2).join('、')}${files.length > 2 ? ` 等 ${files.length} 个文件` : ''}`)
  } else if (runs > 0) {
    summary.push(`执行：${runs} 次助理运行，失败与中断原因已留在运行记录。`)
  }
  if (agentNames.length > 0) {
    summary.push(`参与助理：@${agentNames.slice(0, 3).join('、@')}`)
  }
  if (memberNames.length > 0) {
    summary.push(`参与成员：${memberNames.slice(0, 4).join('、')}${memberNames.length > 4 ? ` 等 ${memberNames.length} 人` : ''}`)
  }
  return summary.slice(0, 4)
}
