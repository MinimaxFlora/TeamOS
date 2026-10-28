import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { config, dataPath } from './config.mjs'
import { deleteFileRow, getFileRow, insertFile, updateFileRow } from './db.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
export const FILES_DIR = dataPath('files')
fs.mkdirSync(FILES_DIR, { recursive: true, mode: 0o700 })

const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.csv', '.json', '.log', '.yml', '.yaml'])
const DOC_EXT = new Set(['.pdf', '.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt'])
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.oga', '.webm', '.aac', '.flac', '.mp4'])

const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.webm': 'audio/webm',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
}

export const PURPOSE_LIMITS = {
  chat: 20 * 1024 * 1024,
  knowledge: 50 * 1024 * 1024,
  audio: 300 * 1024 * 1024,
}

const ALLOWED_BY_PURPOSE = {
  chat: [...TEXT_EXT, ...DOC_EXT, ...IMAGE_EXT],
  knowledge: [...TEXT_EXT, ...DOC_EXT, ...IMAGE_EXT, ...AUDIO_EXT],
  audio: [...AUDIO_EXT],
}

export function safeFileName(name) {
  const base = path.basename(String(name || 'file')).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim()
  return (base || 'file').slice(0, 120)
}

export function kindForName(name) {
  const ext = path.extname(String(name || '')).toLowerCase()
  if (IMAGE_EXT.has(ext)) return 'image'
  if (AUDIO_EXT.has(ext) && ext !== '.mp4') return 'audio'
  if (ext === '.pdf') return 'pdf'
  if (ext === '.xls' || ext === '.xlsx' || ext === '.csv') return 'sheet'
  if (ext === '.ppt' || ext === '.pptx') return 'slides'
  if (TEXT_EXT.has(ext) || DOC_EXT.has(ext)) return 'doc'
  return 'other'
}

export function validateUpload({ name, purpose }) {
  const ext = path.extname(String(name || '')).toLowerCase()
  const allowed = ALLOWED_BY_PURPOSE[purpose] ?? ALLOWED_BY_PURPOSE.chat
  if (!ext || !allowed.includes(ext)) {
    const error = new Error(`不支持的文件类型${ext ? `：${ext}` : ''}`)
    error.status = 400
    throw error
  }
  return ext
}

function pythonBin() {
  const candidates = [
    process.env.HERMES_PYTHON,
    '/opt/hermes/.venv/bin/python',
    'python3',
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (candidate === 'python3' || fs.existsSync(candidate)) return candidate
  }
  return 'python3'
}

function runPython(script, args, timeoutMs = 120000) {
  const result = spawnSync(pythonBin(), [path.join(here, script), ...args], {
    timeout: timeoutMs,
    maxBuffer: 24 * 1024 * 1024,
    encoding: 'utf8',
  })
  if (result.error) return { ok: false, error: result.error.message }
  if (result.status !== 0) {
    return { ok: false, error: (result.stderr || '').trim().slice(-800) || `exit ${result.status}` }
  }
  return { ok: true, stdout: result.stdout ?? '' }
}

export function extractText(filePath, name) {
  const ext = path.extname(name || '').toLowerCase()
  if (TEXT_EXT.has(ext)) {
    try {
      return fs.readFileSync(filePath, 'utf8').slice(0, 400000)
    } catch {
      return ''
    }
  }
  if (!DOC_EXT.has(ext)) return ''
  const result = runPython('extract_text.py', [filePath], 60000)
  return result.ok ? String(result.stdout || '').slice(0, 400000) : ''
}

export function transcribeAudio(filePath) {
  const result = runPython('transcribe.py', [filePath], Number(process.env.STT_TIMEOUT_MS || 1800000))
  if (!result.ok) {
    const error = new Error(`语音转写失败：${result.error}`)
    error.status = 502
    throw error
  }
  let payload
  try {
    payload = JSON.parse(result.stdout)
  } catch {
    throw Object.assign(new Error('语音转写返回格式不正确'), { status: 502 })
  }
  if (!payload.ok) throw Object.assign(new Error(payload.error || '语音转写失败'), { status: 502 })
  return { text: String(payload.text || ''), durationSec: Number(payload.durationSec || 0) }
}

export function saveUpload({ buffer, name, mime, ownerId, purpose }) {
  const safePurpose = PURPOSE_LIMITS[purpose] ? purpose : 'chat'
  const safeName = safeFileName(name)
  const ext = validateUpload({ name: safeName, purpose: safePurpose })
  const limit = PURPOSE_LIMITS[safePurpose]
  if (!buffer?.length) throw Object.assign(new Error('文件内容为空'), { status: 400 })
  if (buffer.length > limit) {
    throw Object.assign(new Error(`文件超过大小限制（${Math.round(limit / 1024 / 1024)} MB）`), { status: 413 })
  }
  const id = `f_${crypto.randomBytes(12).toString('hex')}`
  const target = path.join(FILES_DIR, `${id}${ext}`)
  fs.writeFileSync(target, buffer, { mode: 0o600 })
  const digest = crypto.createHash('sha256').update(buffer).digest('hex')
  const text = extractText(target, safeName)
  return insertFile({
    id,
    ownerId,
    name: safeName,
    mime: String(mime || '').trim() || MIME_BY_EXT[ext] || 'application/octet-stream',
    size: buffer.length,
    sha256: digest,
    kind: kindForName(safeName),
    purpose: safePurpose,
    text: text || null,
  })
}

export function filePathFor(row) {
  const ext = path.extname(row.name || '').toLowerCase()
  return path.join(FILES_DIR, `${row.id}${ext}`)
}

export function fileExists(row) {
  try {
    return fs.statSync(filePathFor(row)).isFile()
  } catch {
    return false
  }
}

export function removeFile(id) {
  const row = getFileRow(id)
  if (!row) return false
  try {
    fs.unlinkSync(filePathFor(row))
  } catch {
    // Already gone.
  }
  deleteFileRow(id)
  return true
}

export function publicFile(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    size: row.size,
    kind: row.kind,
    purpose: row.purpose,
    ownerId: row.owner_id,
    hasText: Boolean(row.text),
    createdAt: row.created_at,
  }
}

export function fileText(row) {
  if (!row) return ''
  if (row.text) return row.text
  const text = extractText(filePathFor(row), row.name)
  if (text) updateFileRow(row.id, { text })
  return text
}

export function mimeForName(name) {
  return MIME_BY_EXT[path.extname(String(name || '')).toLowerCase()] || 'application/octet-stream'
}
