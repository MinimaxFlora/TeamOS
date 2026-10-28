import type { MeetingAction, Member } from './types'

const DECISION_HINT = /(决定|确认|同意|通过|定为|采用|结论)/
const ACTION_HINT = /(待办|负责|跟进|截止|下周|本周|月底|之前完成|前完成|确认一下|对齐一下|补一份|补齐|准备)/

function cleanLine(line: string) {
  return line
    .replace(/^\s*[-*•·]\s*/, '')
    .replace(/^\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/, '')
    .replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function clip(text: string, max = 90) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function splitSentences(line: string) {
  return line
    .split(/(?<=[。！？!?；;])/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 6)
}

function uniq(items: string[]) {
  return Array.from(new Set(items))
}

/**
 * Deterministic, local-only extraction. It never calls a model and never
 * invents items: decisions and actions only come from sentences that contain
 * explicit decision/action wording.
 */
export function summarizeTranscript(transcript: string, participants: Member[]): {
  summary: string[]
  decisions: string[]
  actions: Omit<MeetingAction, 'id' | 'done'>[]
} {
  const lines = transcript
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean)
  if (lines.length === 0) return { summary: [], decisions: [], actions: [] }

  const sentences = uniq(lines.flatMap(splitSentences))
  const pool = sentences.length > 0 ? sentences : lines

  const decisions = uniq(pool.filter((item) => DECISION_HINT.test(item)))
    .slice(0, 3)
    .map((item) => clip(item))

  const actionSentences = uniq(
    pool.filter((item) => ACTION_HINT.test(item) && !/^决定[：:]/.test(item)),
  ).slice(0, 5)

  const actions = actionSentences.map((item) => {
    const owner = participants.find((member) => item.includes(member.name))
    const due = item.match(
      /(今天|明天|本周[一二三四五六日天]?|下周[一二三四五六日天]?|周[一二三四五六日天]|月底|\d{1,2}\s*月\s*\d{1,2}\s*日|\d{1,2}\s*[./]\s*\d{1,2})/,
    )?.[0]
    return {
      text: clip(item, 80),
      ownerId: owner?.id,
      due,
    }
  })

  const summarySource = pool.filter((item) => !decisions.includes(clip(item)))
  const summary = uniq(summarySource.length > 0 ? summarySource : pool)
    .slice(0, 3)
    .map((item) => clip(item))

  if (summary.length === 0) {
    summary.push(clip(lines.join(' '), 120))
  }

  return { summary, decisions, actions }
}
