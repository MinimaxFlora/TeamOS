import crypto from 'node:crypto'
import { connectorSecret, getState, insertWebhookEvent } from './db.mjs'
import { constantTimeEqual, hmacHex, sha256 } from './security.mjs'

const MAX_SKEW_MS = 5 * 60 * 1000

function timestampValid(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return false
  const ms = number < 10_000_000_000 ? number * 1000 : number
  return Math.abs(Date.now() - ms) <= MAX_SKEW_MS
}

function getHeader(headers, ...names) {
  for (const name of names) {
    const value = headers[name]
    if (value) return String(Array.isArray(value) ? value[0] : value)
  }
  return ''
}

function verifyGeneric(headers, raw, secret) {
  const provided = getHeader(headers, 'x-teamos-signature')
  const timestamp = getHeader(headers, 'x-teamos-timestamp')
  if (!provided || !timestamp) return { ok: false, reason: 'missing_signature' }
  if (!timestampValid(timestamp)) return { ok: false, reason: 'stale_timestamp' }
  const expected = hmacHex('sha256', secret, `${timestamp}.${raw}`)
  const normalized = provided.replace(/^sha256=/i, '')
  return { ok: constantTimeEqual(expected, normalized), reason: 'bad_signature' }
}

function verifySlack(headers, raw, secret) {
  const provided = getHeader(headers, 'x-slack-signature')
  const timestamp = getHeader(headers, 'x-slack-request-timestamp')
  if (!provided || !timestamp) return { ok: false, reason: 'missing_signature' }
  if (!timestampValid(timestamp)) return { ok: false, reason: 'stale_timestamp' }
  const expected = `v0=${hmacHex('sha256', secret, `v0:${timestamp}:${raw}`)}`
  return { ok: constantTimeEqual(expected, provided), reason: 'bad_signature' }
}

function verifyFeishu(headers, raw, secret) {
  const provided = getHeader(headers, 'x-lark-signature')
  const timestamp = getHeader(headers, 'x-lark-request-timestamp')
  const nonce = getHeader(headers, 'x-lark-request-nonce')
  if (!provided || !timestamp || !nonce) return { ok: false, reason: 'missing_signature' }
  if (!timestampValid(timestamp)) return { ok: false, reason: 'stale_timestamp' }
  const expected = sha256(`${timestamp}${nonce}${secret}${raw}`)
  return { ok: constantTimeEqual(expected, provided), reason: 'bad_signature' }
}

function verifyWecom(url, raw, secret) {
  const signature = url.searchParams.get('msg_signature')
  const timestamp = url.searchParams.get('timestamp')
  const nonce = url.searchParams.get('nonce')
  if (!signature || !timestamp || !nonce) return { ok: false, reason: 'missing_signature' }
  if (!timestampValid(timestamp)) return { ok: false, reason: 'stale_timestamp' }
  const expected = crypto
    .createHash('sha1')
    .update([secret, timestamp, nonce, raw].sort().join(''))
    .digest('hex')
  return { ok: constantTimeEqual(expected, signature), reason: 'bad_signature' }
}

function verifyDingtalk(headers, raw, secret) {
  const timestamp = getHeader(headers, 'timestamp')
  const signature = getHeader(headers, 'sign')
  if (!timestamp || !signature) return verifyGeneric(headers, raw, secret)
  if (!timestampValid(timestamp)) return { ok: false, reason: 'stale_timestamp' }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}\n${secret}`)
    .digest('base64')
  return { ok: constantTimeEqual(expected, signature), reason: 'bad_signature' }
}

export function verifyWebhook({ kind, headers, rawBody, url, secret }) {
  if (!secret) return { ok: false, reason: 'connector_not_configured' }
  switch (kind) {
    case 'slack':
      return verifySlack(headers, rawBody, secret)
    case 'feishu':
      return verifyFeishu(headers, rawBody, secret)
    case 'wecom':
      return verifyWecom(url, rawBody, secret)
    case 'dingtalk':
      return verifyDingtalk(headers, rawBody, secret)
    default:
      return verifyGeneric(headers, rawBody, secret)
  }
}

export function extractEvent(rawBody) {
  let payload = {}
  try {
    payload = JSON.parse(rawBody)
  } catch {
    payload = { raw: rawBody.slice(0, 4000) }
  }
  const eventId =
    payload.event_id ||
    payload.eventId ||
    payload.id ||
    payload.message_id ||
    payload.MsgId ||
    payload?.header?.event_id ||
    sha256(rawBody).slice(0, 32)
  const eventType =
    payload.event_type ||
    payload.eventType ||
    payload.type ||
    payload?.header?.event_type ||
    payload?.event?.type ||
    'message'
  return { payload, eventId: String(eventId).slice(0, 200), eventType: String(eventType).slice(0, 100) }
}

export function acceptWebhook({ connectorId, kind, headers, rawBody, url }) {
  const state = getState()
  const connector = (state.connectors ?? []).find((item) => item.id === connectorId)
  if (!connector) return { status: 404, body: { error: 'connector_not_found' } }
  if (connector.status !== 'connected') return { status: 409, body: { error: 'connector_disabled' } }
  if (!connector.signature) return { status: 409, body: { error: 'signature_required' } }
  const secretRow = connectorSecret(connectorId)
  if (!secretRow?.secret) return { status: 409, body: { error: 'connector_secret_missing' } }
  const verification = verifyWebhook({
    kind,
    headers,
    rawBody,
    url,
    secret: secretRow.secret,
  })
  if (!verification.ok) {
    return {
      status: verification.reason === 'stale_timestamp' ? 409 : 401,
      body: { error: verification.reason },
    }
  }
  const event = extractEvent(rawBody)
  const inserted = insertWebhookEvent({
    connectorId,
    eventId: event.eventId,
    eventType: event.eventType,
    payload: event.payload,
    signatureValid: true,
  })
  return {
    status: inserted.deduped ? 200 : 202,
    body: { ok: true, eventId: event.eventId, deduped: inserted.deduped },
  }
}
