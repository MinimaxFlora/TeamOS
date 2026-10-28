const DIMENSIONS = 512
const MAX_CHUNK_CHARS = 420

function tokenize(text) {
  const normalized = String(text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[　-〿＀-￯]/g, ' ')
  const tokens = []
  const latin = normalized.match(/[a-z0-9][a-z0-9._-]{1,}/g) ?? []
  tokens.push(...latin)
  const cjkRuns = normalized.match(/[㐀-鿿]{2,}/g) ?? []
  for (const run of cjkRuns) {
    for (let i = 0; i < run.length; i += 1) {
      tokens.push(run[i])
      if (i < run.length - 1) tokens.push(run.slice(i, i + 2))
    }
  }
  return tokens
}

function hashToken(token) {
  let hash = 2166136261
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function embed(text) {
  const vector = new Float32Array(DIMENSIONS)
  const tokens = tokenize(text)
  const counts = new Map()
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
  for (const [token, count] of counts) {
    const index = hashToken(token) % DIMENSIONS
    const sign = hashToken(`${token}#sign`) % 2 === 0 ? 1 : -1
    vector[index] += sign * (1 + Math.log(count))
  }
  let norm = 0
  for (const value of vector) norm += value * value
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < vector.length; i += 1) vector[i] /= norm
  return vector
}

function cosine(left, right) {
  let sum = 0
  for (let i = 0; i < left.length; i += 1) sum += left[i] * right[i]
  return sum
}

function splitChunks(doc) {
  // 归档文档的正文才是真正的知识来源，标题/摘要只作为补充。
  const body = String(doc.content || '').slice(0, 60000)
  const text = `${doc.title}\n${(doc.tags ?? []).join(' ')}\n${doc.summary}\n${body}`
  const sentences = text
    .split(/(?<=[。！？!?；;\n])/)
    .map((part) => part.trim())
    .filter(Boolean)
  const chunks = []
  let current = ''
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > MAX_CHUNK_CHARS) {
      chunks.push(current)
      current = ''
    }
    current += sentence
  }
  if (current.trim()) chunks.push(current)
  if (chunks.length === 0 && text.trim()) chunks.push(text.slice(0, MAX_CHUNK_CHARS))
  return chunks.slice(0, 400).map((chunk, index) => ({
    id: `${doc.id}#${index}`,
    text: chunk,
    doc,
    vector: embed(chunk),
    tokens: new Set(tokenize(chunk).filter((token) => token.length > 1)),
  }))
}

function canReadDoc(doc, user) {
  if (!doc.restricted) return true
  if (user.role === 'admin') return true
  return doc.ownerId === user.member_id
}

export function retrieveKnowledge({ state, user, agent, query, limit = 4 }) {
  const spaces = new Set(agent.knowledge ?? [])
  if (spaces.size === 0) return []
  const queryVector = embed(query)
  if (queryVector.every((value) => value === 0)) return []
  const queryTokens = new Set(tokenize(query).filter((token) => token.length > 1))
  const spaceNames = new Map((state.knowledge ?? []).map((space) => [space.id, space.name]))
  const candidates = []
  for (const doc of state.knowledgeDocs ?? []) {
    if (doc.status !== 'ready') continue
    if (!spaces.has(doc.spaceId)) continue
    if (!canReadDoc(doc, user)) continue
    for (const chunk of splitChunks(doc)) {
      let overlap = 0
      for (const token of queryTokens) if (chunk.tokens.has(token)) overlap += 1
      if (overlap < Math.min(2, queryTokens.size)) continue
      const similarity = cosine(queryVector, chunk.vector)
      const titleHit = [...queryTokens].some((token) => doc.title.includes(token))
      const score = similarity + (titleHit ? 0.08 : 0)
      if (score >= 0.08) {
        candidates.push({
          score,
          chunk,
          spaceName: spaceNames.get(doc.spaceId) ?? '企业知识',
        })
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  const seen = new Set()
  const results = []
  for (const candidate of candidates) {
    if (seen.has(candidate.chunk.doc.id)) continue
    seen.add(candidate.chunk.doc.id)
    results.push({
      docId: candidate.chunk.doc.id,
      title: candidate.chunk.doc.title,
      spaceName: candidate.spaceName,
      excerpt: candidate.chunk.text.slice(0, 900),
      score: candidate.score,
      restricted: Boolean(candidate.chunk.doc.restricted),
    })
    if (results.length >= limit) break
  }
  return results
}

export function formatKnowledgeContext(results) {
  if (!results.length) return ''
  return results
    .map(
      (result, index) =>
        `[知识 ${index + 1}]《${result.title}》 · ${result.spaceName}${result.restricted ? ' · 受限' : ''}\n${result.excerpt}`,
    )
    .join('\n\n')
}

export function toSourceRefs(results) {
  return results.map((result) => ({
    label: `《${result.title}》`,
    meta: `${result.spaceName} · 已审批 · 相似度 ${result.score.toFixed(2)}`,
  }))
}
