/**
 * 技能安装器：把技能仓库里的技能目录真正落到 Hermes 的技能目录。
 *
 *   <HERMES_HOME>/skills/<技能 ID>/SKILL.md
 *                        /scripts/
 *                        /references/
 *                        /_meta.json
 *
 * 之所以要真装：TeamOS 把 Hermes 当 OpenAI 兼容接口用，技能文件在磁盘上才能
 * 被读取、被 Hermes 的 agent 模式发现，也方便运维直接看、直接改。
 *
 * 仓库结构：skills/<分类>/<技能 ID>/{SKILL.md,scripts,references,_meta.json}
 * 拉取方式：优先 GitHub 源码包（一次请求拿到全部文件），失败再退回逐个文件下载。
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { config, dataPath, ROOT } from './config.mjs'

const INSTALLED_INDEX = 'installed-skills.json'
const TARBALL_CACHE = 'skill-repo.tar.gz'
const TARBALL_TTL_MS = 6 * 60 * 60 * 1000
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_TOTAL_BYTES = 40 * 1024 * 1024

/** 技能装到 Hermes 家目录下的 skills/，与仓库 scripts/install.sh 的约定一致。 */
export function skillsRoot() {
  return path.join(config.hermes.home, 'skills')
}

function indexPath() {
  return dataPath(INSTALLED_INDEX)
}

export function readInstalled() {
  try {
    const raw = JSON.parse(fs.readFileSync(indexPath(), 'utf8'))
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function writeInstalled(next) {
  fs.mkdirSync(path.dirname(indexPath()), { recursive: true })
  fs.writeFileSync(indexPath(), JSON.stringify(next, null, 2))
}

/* ------------------------------------------------------------------ */
/* tar 解包（ustar + pax path），不引第三方依赖                        */
/* ------------------------------------------------------------------ */

function readString(buffer, offset, length) {
  const slice = buffer.subarray(offset, offset + length)
  const end = slice.indexOf(0)
  return slice.subarray(0, end === -1 ? slice.length : end).toString('utf8')
}

function readOctal(buffer, offset, length) {
  const text = readString(buffer, offset, length).trim()
  return text ? Number.parseInt(text, 8) || 0 : 0
}

/** pax 扩展头里 path= 可能覆盖下一个条目的文件名。 */
function parsePax(buffer) {
  const result = {}
  let cursor = 0
  while (cursor < buffer.length) {
    const space = buffer.indexOf(0x20, cursor)
    if (space === -1) break
    const length = Number.parseInt(buffer.subarray(cursor, space).toString(), 10)
    if (!Number.isFinite(length) || length <= 0) break
    const record = buffer.subarray(space + 1, cursor + length - 1).toString('utf8')
    const equals = record.indexOf('=')
    if (equals > 0) result[record.slice(0, equals)] = record.slice(equals + 1)
    cursor += length
  }
  return result
}

/** 返回 [{ path, data }]，path 已去掉仓库顶层目录（<repo>-<branch>/）。 */
export function extractTarGz(gzipBuffer) {
  const buffer = zlib.gunzipSync(gzipBuffer)
  const entries = []
  let offset = 0
  let pendingLongName = ''
  let pendingPax = {}

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break

    const name = readString(header, 0, 100)
    const size = readOctal(header, 124, 12)
    const type = String.fromCharCode(header[156] || 48)
    const prefix = readString(header, 345, 155)
    const dataStart = offset + 512
    const dataEnd = dataStart + size
    const nextOffset = dataStart + Math.ceil(size / 512) * 512

    if (type === 'x') {
      pendingPax = parsePax(buffer.subarray(dataStart, dataEnd))
      offset = nextOffset
      continue
    }
    if (type === 'L') {
      pendingLongName = readString(buffer.subarray(dataStart, dataEnd), 0, size)
      offset = nextOffset
      continue
    }
    if (type === 'g') {
      offset = nextOffset
      continue
    }

    const fullName = pendingPax.path || pendingLongName || (prefix ? `${prefix}/${name}` : name)
    pendingPax = {}
    pendingLongName = ''
    offset = nextOffset

    if (!fullName || type === '5' || type === '1' || type === '2' || type === '6') continue
    const relative = fullName.split('/').slice(1).join('/')
    if (!relative || relative.includes('..')) continue
    entries.push({ path: relative, data: buffer.subarray(dataStart, dataEnd) })
  }

  return entries
}

/* ------------------------------------------------------------------ */
/* 拉取仓库                                                            */
/* ------------------------------------------------------------------ */

/** 从技能源地址解析出 owner / repo / branch。 */
export function repoFromMarket(market) {
  const url = String(market?.source?.url ?? '')
  const raw = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\//.exec(url)
  const gh = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\//.exec(url)
  const match = raw ?? gh
  if (!match) return null
  return { owner: match[1], repo: match[2], branch: match[3] }
}

async function downloadTarball(repo, { force = false } = {}) {
  const cacheFile = dataPath(TARBALL_CACHE)
  const key = `${repo.owner}/${repo.repo}@${repo.branch}`
  try {
    const stat = fs.statSync(cacheFile)
    const meta = JSON.parse(fs.readFileSync(`${cacheFile}.json`, 'utf8'))
    if (!force && meta.key === key && Date.now() - stat.mtimeMs < TARBALL_TTL_MS) {
      return fs.readFileSync(cacheFile)
    }
  } catch {
    // 没缓存就走网络
  }

  const urls = [
    `https://codeload.github.com/${repo.owner}/${repo.repo}/tar.gz/refs/heads/${repo.branch}`,
    `https://github.com/${repo.owner}/${repo.repo}/archive/refs/heads/${repo.branch}.tar.gz`,
  ]
  let lastError
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'TeamOS-SkillInstaller/1.0' },
        signal: AbortSignal.timeout(60_000),
        redirect: 'follow',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length < 512) throw new Error('源码包为空')
      fs.writeFileSync(cacheFile, buffer)
      fs.writeFileSync(`${cacheFile}.json`, JSON.stringify({ key, at: new Date().toISOString() }))
      return buffer
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`下载技能仓库失败：${lastError?.message ?? '未知错误'}`)
}

/* ------------------------------------------------------------------ */
/* 安装 / 卸载                                                         */
/* ------------------------------------------------------------------ */

function safeSlug(value) {
  return /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(String(value ?? ''))
}

export async function installSkill(slug, market) {
  if (!safeSlug(slug)) return { ok: false, error: '技能 ID 不合法' }
  const entry = market?.skills?.find((item) => item.slug === slug)
  if (!entry) return { ok: false, error: '技能源里没有这个技能' }
  const repo = repoFromMarket(market)
  if (!repo) return { ok: false, error: '当前技能源不是 GitHub 仓库，无法安装' }

  let entries
  try {
    entries = extractTarGz(await downloadTarball(repo))
  } catch (error) {
    return { ok: false, error: error.message }
  }

  const prefix = `${entry.path.replace(/\/+$/, '')}/`
  const files = entries.filter((item) => item.path.startsWith(prefix))
  if (!files.length) return { ok: false, error: '源码包里找不到这个技能目录' }

  let total = 0
  for (const file of files) {
    if (file.data.length > MAX_FILE_BYTES) return { ok: false, error: `文件过大：${file.path}` }
    total += file.data.length
  }
  if (total > MAX_TOTAL_BYTES) return { ok: false, error: '技能体积超过 40 MB，拒绝安装' }

  const target = path.join(skillsRoot(), slug)
  fs.rmSync(target, { recursive: true, force: true })
  for (const file of files) {
    const relative = file.path.slice(prefix.length)
    const destination = path.resolve(target, relative)
    if (!destination.startsWith(path.resolve(target) + path.sep)) continue
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, file.data)
  }

  const installed = readInstalled()
  installed[slug] = {
    slug,
    name: entry.name,
    version: entry.version || '',
    category: entry.category,
    categoryName: entry.categoryName,
    path: entry.path,
    installedAt: new Date().toISOString(),
    bytes: total,
    files: files.length,
    sourceUrl: `https://github.com/${repo.owner}/${repo.repo}/tree/${repo.branch}/${entry.path}`,
  }
  writeInstalled(installed)
  return { ok: true, installed: installed[slug], root: skillsRoot() }
}

export function uninstallSkill(slug) {
  if (!safeSlug(slug)) return { ok: false, error: '技能 ID 不合法' }
  const target = path.join(skillsRoot(), slug)
  fs.rmSync(target, { recursive: true, force: true })
  const installed = readInstalled()
  delete installed[slug]
  writeInstalled(installed)
  return { ok: true }
}

/** 已安装列表：以索引为准，磁盘目录缺失的标记出来。 */
export function listInstalled() {
  const installed = readInstalled()
  return Object.values(installed).map((item) => ({
    ...item,
    present: fs.existsSync(path.join(skillsRoot(), item.slug)),
  }))
}

export function skillsRootInfo() {
  return {
    root: skillsRoot(),
    exists: fs.existsSync(skillsRoot()),
    hermesHome: config.hermes.home,
    repoRoot: ROOT,
  }
}

/** 去掉 YAML frontmatter，只留正文。 */
function stripFrontmatter(text) {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text)
  return match ? text.slice(match[0].length) : text
}

/**
 * 读取已安装技能的指令正文，供聊天时拼进 system prompt。
 * 找不到（没装、或技能没有正文）返回空串，调用方退回「名字 + 描述」。
 */
export function skillInstructions(slug, maxChars = 8000) {
  if (!safeSlug(slug)) return ''
  try {
    const file = path.join(skillsRoot(), slug, 'SKILL.md')
    const text = stripFrontmatter(fs.readFileSync(file, 'utf8')).trim()
    if (!text) return ''
    return text.length > maxChars ? `${text.slice(0, maxChars)}\n…（正文已截断）` : text
  } catch {
    return ''
  }
}
