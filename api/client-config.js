import crypto from 'node:crypto'
import { findClientById } from './_sheets.js'

function adminKeyMatches(req) {
  const expected = process.env.ADMIN_API_KEY
  if (!expected) return false
  const provided = req.headers?.['x-admin-key']
  if (typeof provided !== 'string') return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' })

  const clientId = typeof req.query?.client === 'string' ? req.query.client.trim() : ''
  if (!clientId) return res.status(400).json({ error: 'A client query param is required.' })

  let record
  try {
    record = await findClientById(clientId)
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unable to read Google Sheets.' })
  }

  if (!record) return res.status(404).json({ error: 'Client not found.' })

  const isAdminPreview = adminKeyMatches(req)

  // Drafts are gated — clients without admin auth see "not yet active".
  if (record.status === 'draft' && !isAdminPreview) {
    return res.status(423).json({
      error: 'This onboarding link is not yet active. Your link will be activated after final review.',
      status: 'draft',
    })
  }

  return res.status(200).json({
    clientId: record.client_id,
    status: record.status,
    createdAt: record.created_at,
    clientName: record.client_name,
    businessName: record.business_name,
    businessLocation: record.business_location,
    ownerName: record.owner_name,
    companyName: record.company_name,
    onboardingUrl: record.onboarding_url,
    config: record.config,
    isPreview: isAdminPreview && record.status === 'draft',
  })
}
