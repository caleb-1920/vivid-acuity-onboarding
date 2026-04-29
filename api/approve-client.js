import { requireAdmin } from './_auth.js'
import { findClientById, updateClientById } from './_sheets.js'

const MAX_BODY_BYTES = 64 * 1024

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

  const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : ''
  if (!clientId) return res.status(400).json({ error: 'clientId is required.' })

  let record
  try {
    record = await findClientById(clientId)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
  if (!record) return res.status(404).json({ error: 'Client not found.' })

  if (record.status === 'paid') {
    return res.status(409).json({ error: 'Client has already paid; cannot re-approve.' })
  }
  if (record.status === 'pending') {
    return res.status(200).json({ alreadyApproved: true, clientId, status: 'pending' })
  }
  if (record.status !== 'draft') {
    return res.status(400).json({ error: `Unexpected status "${record.status}".` })
  }

  try {
    await updateClientById(clientId, { status: 'pending' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }

  return res.status(200).json({ clientId, status: 'pending' })
}
