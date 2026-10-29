/**
 * 技能中心的数据源。
 *
 * 与 1Panel 应用商店同一套加载思路：远端仓库里只有一个索引（catalog.json），
 * 每个技能一个目录（skills/<分类>/<技能>/SKILL.md）。服务端只做三件事：
 *   1. 拉索引并缓存到数据卷，避免每次打开页面都回源；
 *   2. 管理员可以改技能源地址（默认指向 TeamOS-Skills 仓库）；
 *   3. 添加某个技能时再按需下载它的 SKILL.md。
 */
import fs from 'node:fs'
import { dataPath } from './config.mjs'
import { getSetting, setSetting } from './db.mjs'

export const DEFAULT_MARKET_SOURCE =
  process.env.SKILL_MARKET_SOURCE ||
  'https://raw.githubusercontent.com/MinimaxFlora/TeamOS-Skills/main/catalog.json'

const SETTING_KEY = 'skillMarket'
const CACHE_FILE = 'skill-market-cache.json'
const INDEX_TTL_MS = 6 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 20_000
const MAX_INDEX_BYTES = 24 * 1024 * 1024

let memory = null
let inflight = null

const cachePath = () => dataPath(CACHE_FILE)

/** 只允许公网 http(s)，避免管理员误填内网地址后被服务端代理访问。 */
export function validateSource(raw) {
  let url
  try {
    url = new URL(String(raw ?? '').trim())
  } catch {
    return { ok: false, error: '技能源必须是完整的 URL' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: '技能源只支持 http / https' }
  }
  const host = url.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^(10|127)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '[::1]' ||
    host.startsWith('169.254.')
  ) {
    return { ok: false, error: '技能源不能是内网地址' }
  }
  if (!/\.(json|ya?ml)$/i.test(url.pathname)) {
    return { ok: false, error: '技能源应指向 catalog.json 或 data.yaml' }
  }
  return { ok: true, url: url.toString() }
}

export function getMarketSource() {
  const stored = getSetting(SETTING_KEY)
  const url = typeof stored?.url === 'string' && stored.url ? stored.url : DEFAULT_MARKET_SOURCE
  return { url, custom: url !== DEFAULT_MARKET_SOURCE, updatedAt: stored?.updatedAt ?? null }
}

export function setMarketSource(raw, actor) {
  const checked = validateSource(raw)
  if (!checked.ok) return checked
  setSetting(SETTING_KEY, { url: checked.url, updatedAt: new Date().toISOString(), actor: actor ?? '' })
  memory = null
  inflight = null
  try {
    fs.rmSync(cachePath(), { force: true })
  } catch {
    // 缓存文件删不掉不影响主流程
  }
  return { ok: true, url: checked.url }
}

function readCacheFile() {
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath(), 'utf8'))
    if (!raw || typeof raw.url !== 'string' || !raw.market) return null
    return raw
  } catch {
    return null
  }
}

function writeCacheFile(entry) {
  try {
    fs.writeFileSync(cachePath(), JSON.stringify(entry))
  } catch {
    // 数据卷只读时退化成内存缓存
  }
}

/**
 * GitHub raw 在国内 VPS 上经常连不上，所以同一个仓库额外试一遍 jsDelivr 镜像。
 * 返回顺序就是尝试顺序。
 */
function sourceCandidates(sourceUrl) {
  const candidates = []
  const raw = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/.exec(sourceUrl)
  const blob = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+)$/.exec(sourceUrl)
  const match = raw ?? blob
  if (match) {
    const [, owner, repo, branch, file] = match
    candidates.push(`https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${file}`)
  }
  candidates.push(sourceUrl)
  return [...new Set(candidates)]
}

/** 仓库根地址：从索引地址剥掉文件名。 */
const repoBase = (indexUrl) => indexUrl.replace(/[^/]+$/, '')

function normalize(data, indexUrl) {
  const rawCategories = Array.isArray(data.categories) ? data.categories : []
  const categories = rawCategories.map((item) => ({
    id: String(item.id ?? ''),
    name: String(item.name ?? item.id ?? ''),
    count: Number(item.count ?? item.skills?.length ?? 0),
  }))

  const skills = []
  for (const category of rawCategories) {
    for (const item of Array.isArray(category.skills) ? category.skills : []) {
      skills.push({
        slug: String(item.id ?? ''),
        name: String(item.name ?? item.id ?? ''),
        version: String(item.version ?? ''),
        description: String(item.description ?? ''),
        category: String(category.id ?? ''),
        categoryName: String(category.name ?? ''),
        path: String(item.path ?? `${category.path ?? ''}/${item.id ?? ''}`),
        sourceUrl: String(item.sourceUrl ?? ''),
      })
    }
  }

  return {
    name: String(data.name ?? 'TeamOS-Skills'),
    updated: String(data.updated ?? ''),
    total: Number(data.total ?? skills.length),
    categories,
    skills,
    indexUrl,
  }
}

async function fetchIndexOnce(target) {
  const response = await fetch(target, {
    headers: { accept: 'application/json', 'user-agent': 'TeamOS-SkillMarket/1.0' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`技能源返回 ${response.status}`)
  const text = await response.text()
  if (text.length > MAX_INDEX_BYTES) throw new Error('技能索引超过 24 MB，拒绝加载')
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('技能源不是合法 JSON')
  }
  if (!data || !Array.isArray(data.categories)) throw new Error('技能索引缺少 categories 数组')
  return { data, indexUrl: target }
}

async function fetchIndex(sourceUrl) {
  let lastError
  for (const target of sourceCandidates(sourceUrl)) {
    try {
      return await fetchIndexOnce(target)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error('技能源不可用')
}

async function refresh(sourceUrl) {
  const { data, indexUrl } = await fetchIndex(sourceUrl)
  const entry = {
    url: sourceUrl,
    indexUrl,
    fetchedAt: new Date().toISOString(),
    market: normalize(data, indexUrl),
  }
  memory = entry
  writeCacheFile(entry)
  return entry
}

export async function loadMarket({ force = false } = {}) {
  const { url } = getMarketSource()
  const now = Date.now()

  if (!force) {
    if (memory && memory.url === url && now - Date.parse(memory.fetchedAt) < INDEX_TTL_MS) {
      return { ...memory, cached: true }
    }
    const disk = readCacheFile()
    if (disk && disk.url === url && now - Date.parse(disk.fetchedAt) < INDEX_TTL_MS) {
      memory = disk
      return { ...disk, cached: true }
    }
  }

  if (!inflight || force) {
    inflight = refresh(url).finally(() => {
      inflight = null
    })
  }

  try {
    const entry = await inflight
    return { ...entry, cached: false }
  } catch (error) {
    // 回源失败时退回过期缓存，页面还能用
    const stale = memory?.url === url ? memory : readCacheFile()
    if (stale && stale.url === url) {
      return { ...stale, cached: true, stale: true, error: error.message }
    }
    throw error
  }
}

/** 技能正文地址：仓库里的 <path>/SKILL.md。 */
function contentUrls(entry, skill) {
  const base = repoBase(entry.indexUrl)
  const relative = (skill.path || `${skill.category}/${skill.slug}`).replace(/^\/+/, '')
  return [...new Set(sourceCandidates(`${base}${relative}/SKILL.md`))]
}

export async function fetchSkillContent(slug, entry) {
  const market = entry ?? (await loadMarket())
  const skill = market.market.skills.find((item) => item.slug === String(slug ?? '').trim())
  if (!skill) return { ok: false, error: '技能不存在于当前技能源' }

  let lastError = '找不到技能正文'
  for (const url of contentUrls(market, skill)) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'TeamOS-SkillMarket/1.0' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'follow',
      })
      if (!response.ok) {
        lastError = `下载失败（${response.status}）`
        continue
      }
      const text = await response.text()
      const trimmed = text.trim()
      if (!trimmed || /^<a href=/i.test(trimmed) || trimmed.startsWith('<!DOCTYPE')) {
        lastError = '正文不是 Markdown'
        continue
      }
      return { ok: true, content: text.slice(0, 200_000), url }
    } catch (error) {
      lastError = error.message
    }
  }
  return { ok: false, error: lastError }
}

export function marketStatus() {
  const source = getMarketSource()
  const entry = memory ?? readCacheFile()
  return {
    source,
    defaultSource: DEFAULT_MARKET_SOURCE,
    fetchedAt: entry?.fetchedAt ?? null,
    indexUrl: entry?.indexUrl ?? null,
    total: entry?.market?.total ?? null,
  }
}
