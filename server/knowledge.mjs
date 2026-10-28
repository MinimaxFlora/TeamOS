import { getFileRow, getRawState, saveState } from './db.mjs'
import { newId } from './auth.mjs'
import { nowISO } from './state.mjs'
import { fileText, removeFile } from './files.mjs'

export const PROPOSAL_DAYS = 7

export function humanSize(bytes) {
  const size = Number(bytes || 0)
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  if (size >= 1024) return `${Math.round(size / 1024)} KB`
  return `${size} B`
}

/** Pending knowledge entries expire after a week and their files are deleted. */
export function sweepExpiredKnowledge() {
  const { state } = getRawState()
  const docs = Array.isArray(state.knowledgeDocs) ? state.knowledgeDocs : []
  const expired = docs.filter(
    (doc) => doc.status === 'review' && doc.expiresAt && new Date(doc.expiresAt).getTime() < Date.now(),
  )
  if (!expired.length) return 0
  const expiredIds = new Set(expired.map((doc) => doc.id))
  const fileIds = expired.map((doc) => doc.fileId).filter(Boolean)
  saveState({
    ...state,
    knowledgeDocs: docs.filter((doc) => !expiredIds.has(doc.id)),
  })
  for (const fileId of fileIds) {
    const stillUsed = docs.some(
      (doc) => !expiredIds.has(doc.id) && doc.fileId === fileId && doc.status === 'ready',
    )
    if (!stillUsed) removeFile(fileId)
  }
  return expired.length
}

export function fileUsedByApprovedDoc(state, fileId) {
  return (state.knowledgeDocs ?? []).some(
    (doc) => doc.fileId === fileId && doc.status === 'ready',
  )
}

/**
 * Create a pending knowledge entry from an uploaded file. Admins approve it;
 * unapproved entries disappear after PROPOSAL_DAYS.
 */
export function proposeKnowledgeFromFile({
  user,
  fileId,
  title,
  spaceId,
  summary,
  tags,
  restricted,
  approve = false,
}) {
  const row = getFileRow(fileId)
  if (!row) throw Object.assign(new Error('文件不存在'), { status: 404 })
  if (row.owner_id !== user.member_id && user.role !== 'admin') {
    throw Object.assign(new Error('只能归档自己上传的文件'), { status: 403 })
  }
  const state = getRawState().state
  const existing = (state.knowledgeDocs ?? []).find(
    (doc) => doc.fileId === fileId && doc.ownerId === user.member_id && doc.status === 'review',
  )
  if (existing) return existing
  const member = (state.members ?? []).find((item) => item.id === user.member_id)
  const space = (state.knowledge ?? []).find((item) => item.id === spaceId) ?? (state.knowledge ?? [])[0]
  if (!space) throw Object.assign(new Error('请先创建知识空间'), { status: 409 })
  const now = nowISO()
  const doc = {
    id: newId('kd'),
    spaceId: space.id,
    title: String(title || row.name).trim().slice(0, 80),
    summary: String(summary || '').trim().slice(0, 400),
    tags: Array.isArray(tags)
      ? tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 6)
      : [],
    kind: row.kind === 'audio' ? 'doc' : row.kind,
    size: humanSize(row.size),
    source: `员工归档 · ${member?.name ?? user.email}`,
    ownerId: user.member_id,
    restricted: Boolean(restricted),
    // 管理员自己上传的资料直接生效；员工提交的进入 7 天审批队列。
    status: approve ? 'ready' : 'review',
    approvedAt: approve ? now : undefined,
    approvedBy: approve ? user.member_id : undefined,
    fileId: row.id,
    fileName: row.name,
    content: fileText(row) || '',
    updatedAt: now,
    createdAt: now,
    expiresAt: approve ? null : new Date(Date.now() + PROPOSAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  }
  saveState({
    ...state,
    knowledgeDocs: [doc, ...(state.knowledgeDocs ?? [])],
  })
  return doc
}
