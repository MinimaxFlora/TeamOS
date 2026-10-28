// Builds the bundled skill library from three public repositories.
// Run: node scripts/build-skill-library.mjs
import fs from 'node:fs'
import path from 'node:path'

const REPOS = [
  { repo: 'sandbaseai/workbuddy-skill', branch: 'main', label: 'WorkBuddy Skills' },
  { repo: 'anbeime/skill', branch: 'main', label: 'Anbeime Skills' },
  { repo: 'xstongxue/best-skills', branch: 'main', label: 'Best Skills' },
]

const CATEGORY_RULES = [
  ['安全合规', /security|secur|privacy|compliance|threat|vulnerab|prompt-injection|secret|audit|governance|oauth|access-control/i],
  ['数据分析', /data|sql|database|postgres|mysql|bigquery|analytics|spark|dbt|schema|metric/i],
  ['编程开发', /code|debug|test|refactor|api|frontend|backend|python|typescript|javascript|java|go-|rust|mcp|devops|git|docker|kubernetes|cloud|aws|azure|terraform|ci-|github|release|performance|architecture|dependency/i],
  ['产品设计', /design|ui|ux|accessibility|product|roadmap|prd|research|wireframe|figma/i],
  ['内容创作', /writ|content|copy|blog|email|documentation|doc-|readme|translat|story|marketing|seo|ad-/i],
  ['办公协作', /meeting|excel|sheet|pdf|office|ppt|presentation|minutes|expense|report|resume|interview|onboarding|handoff|team/i],
  ['自动化', /automat|workflow|agent|orchestrat|pipeline|browser|scrap|cron/i],
]

function categoryOf(name, text) {
  const haystack = `${name} ${text.slice(0, 800)}`
  for (const [label, pattern] of CATEGORY_RULES) {
    if (pattern.test(haystack)) return label
  }
  return '通用'
}

const RISK_RULES = [
  ['high', /shell|command|credential|secret|exec|network|browser|shell-exec|deploy|production/i],
  ['medium', /write|file|database|api-request|http|upload/i],
]

function riskOf(text) {
  for (const [level, pattern] of RISK_RULES) {
    if (pattern.test(text.slice(0, 4000))) return level
  }
  return 'low'
}

function parseFrontmatter(raw) {
  const meta = {}
  let body = raw
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (match) {
    body = raw.slice(match[0].length)
    const lines = match[1].split(/\r?\n/)
    let key = null
    let block = []
    const flush = () => {
      if (key && block.length) meta[key] = block.join(' ').replace(/\s+/g, ' ').trim()
      block = []
    }
    for (const line of lines) {
      const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
      if (pair) {
        flush()
        key = pair[1]
        const value = pair[2].trim()
        if (value === '>' || value === '|' || value === '') {
          meta[key] = ''
        } else {
          meta[key] = value.replace(/^["']|["']$/g, '')
          key = null
        }
      } else if (key && /^\s+/.test(line)) {
        block.push(line.trim())
      } else {
        flush()
        key = null
      }
    }
    flush()
  }
  return { meta, body: body.trim() }
}

function firstParagraph(body) {
  const lines = body.split(/\r?\n/)
  const paragraph = []
  let started = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (started && paragraph.length) break
      continue
    }
    if (trimmed.startsWith('#') || trimmed.startsWith('```') || trimmed.startsWith('|')) {
      if (started && paragraph.length) break
      continue
    }
    started = true
    paragraph.push(trimmed)
    if (paragraph.join(' ').length > 220) break
  }
  return paragraph.join(' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 240)
}

async function fetchText(url, attempt = 0) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'TeamOS-skill-import' } })
    if (!response.ok) throw new Error(`${response.status}`)
    const text = await response.text()
    return text.slice(0, 60_000)
  } catch (error) {
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)))
      return fetchText(url, attempt + 1)
    }
    return null
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  async function run() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

function slugOf(filePath) {
  return filePath.split('/').filter(Boolean).slice(-2)[0] || filePath
}

function normalizeKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[-_\s]+/g, '')
    .replace(/[^a-z0-9一-龥]/g, '')
}

const entries = []
const seen = new Set()

for (const { repo, branch, label } of REPOS) {
  console.log(`Fetching tree for ${repo}…`)
  const treeResponse = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`,
    { headers: { 'user-agent': 'TeamOS-skill-import' } },
  )
  if (!treeResponse.ok) {
    console.warn(`  skipped ${repo}: ${treeResponse.status}`)
    continue
  }
  const tree = await treeResponse.json()
  const files = (tree.tree || [])
    .map((item) => item.path)
    .filter((p) => /(^|\/)SKILL\.md$/i.test(p) && !p.includes('/_template/'))

  console.log(`  ${files.length} skills`)
  let done = 0
  const fetched = await mapLimit(files, 10, async (filePath) => {
    const url = `https://raw.githubusercontent.com/${repo}/${branch}/${filePath}`
    const raw = await fetchText(url)
    done += 1
    if (done % 25 === 0) process.stdout.write(`  ${done}/${files.length}\n`)
    if (!raw) return null
    const { meta, body } = parseFrontmatter(raw)
    const name = String(meta.name || slugOf(filePath)).trim()
    const description = String(meta.description || firstParagraph(body) || '').trim()
    if (!name || !description) return null
    return {
      name,
      description: description.slice(0, 600),
      slug: slugOf(filePath),
      sourceRepo: label,
      sourceUrl: `https://github.com/${repo}/blob/${branch}/${filePath}`,
      rawUrl: url,
      content: raw,
      license: String(meta.license || '见源仓库'),
      version: String(meta.version || '1.0.0'),
      category: String(meta.category || categoryOf(name, body)),
      risk: riskOf(raw),
    }
  })

  for (const entry of fetched) {
    if (!entry) continue
    const key = normalizeKey(entry.name)
    if (seen.has(key)) continue
    // 同名技能只保留一个；描述过于相似的也视为重复。
    const duplicate = entries.some(
      (item) =>
        normalizeKey(item.name) === key ||
        (item.description.length > 40 &&
          item.description.slice(0, 60) === entry.description.slice(0, 60)),
    )
    if (duplicate) continue
    seen.add(key)
    entries.push(entry)
  }
  console.log(`  total after ${repo}: ${entries.length}`)
}

entries.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))

const output = {
  generatedAt: new Date().toISOString(),
  sources: REPOS.map(({ repo, branch, label }) => ({
    label,
    repo,
    url: `https://github.com/${repo}`,
  })),
  count: entries.length,
  skills: entries,
}

const target = path.join(process.cwd(), 'public', 'skill-library.json')
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, JSON.stringify(output))
console.log(`Wrote ${entries.length} skills to ${target}`)
const byCategory = {}
for (const entry of entries) byCategory[entry.category] = (byCategory[entry.category] || 0) + 1
console.log(byCategory)
