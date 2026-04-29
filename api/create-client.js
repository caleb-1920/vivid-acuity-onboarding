import crypto from 'node:crypto'
import { requireAdmin } from './_auth.js'
import { appendClientRow } from './_sheets.js'

const MAX_BODY_BYTES = 1 * 1024 * 1024
const MAX_CONFIG_JSON_BYTES = 40 * 1024 // warn well before Sheets' 50K cell limit

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body
  }
  let total = 0
  const chunks = []
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > MAX_BODY_BYTES) throw new Error('Request body too large.')
    chunks.push(buf)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return {}
  }
}

function getOrigin(req) {
  return (
    req.headers.origin ||
    `https://${req.headers['x-forwarded-host'] || req.headers.host || ''}`.replace(/\/$/, '')
  )
}

function isPlainString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })
  if (!requireAdmin(req, res)) return

  let body
  try {
    body = await parseJsonBody(req)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const {
    clientName,
    businessName,
    businessLocation,
    clientEmail,
    ownerName,
    companyName,
    governingState,
    config,
  } = body || {}

  if (!isPlainString(clientName)) return res.status(400).json({ error: 'clientName is required.' })
  if (!isPlainString(businessName)) return res.status(400).json({ error: 'businessName is required.' })
  if (!isPlainString(clientEmail)) return res.status(400).json({ error: 'clientEmail is required.' })
  if (!config || typeof config !== 'object') return res.status(400).json({ error: 'config object is required.' })

  const normalizedGoverningState = isPlainString(governingState)
    ? governingState.trim()
    : isPlainString(config.governingState)
      ? config.governingState.trim()
      : 'Michigan'
  const normalizedConfig = { ...config, governingState: normalizedGoverningState }
  const configJson = JSON.stringify(normalizedConfig)
  if (Buffer.byteLength(configJson, 'utf8') > MAX_CONFIG_JSON_BYTES) {
    return res.status(400).json({
      error: `config_json exceeds ${MAX_CONFIG_JSON_BYTES} bytes — Google Sheets rejects single cells over 50K.`,
    })
  }

  const clientId = crypto.randomUUID()
  const origin = getOrigin(req)
  const onboardingUrl = `${origin}/?client=${clientId}`
  const createdAt = new Date().toISOString()

  const record = {
    client_id: clientId,
    status: 'draft',
    created_at: createdAt,
    paid_at: '',
    client_name: clientName.trim(),
    business_name: businessName.trim(),
    business_location: isPlainString(businessLocation) ? businessLocation.trim() : '',
    client_email: clientEmail.trim(),
    owner_name: isPlainString(ownerName) ? ownerName.trim() : 'Caleb Hingos',
    company_name: isPlainString(companyName) ? companyName.trim() : 'Vivid Acuity, LLC',
    plan_selected: '',
    amount_paid: '',
    stripe_session_id: '',
    proposal_signed_at: '',
    contract_signed_at: '',
    onboarding_url: onboardingUrl,
    config_json: configJson,
  }

  try {
    await appendClientRow(record)
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to write client to Google Sheets.' })
  }

  return res.status(200).json({
    clientId,
    onboardingUrl,
    createdAt,
  })
}
