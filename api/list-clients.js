import { requireAdmin } from './_auth.js'
import { readAllClients } from './_sheets.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' })
  if (!requireAdmin(req, res)) return

  let records
  try {
    records = await readAllClients()
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unable to read Google Sheets.' })
  }

  const clients = records.map((record) => ({
    clientId: record.client_id,
    status: record.status,
    createdAt: record.created_at,
    paidAt: record.paid_at,
    clientName: record.client_name,
    businessName: record.business_name,
    clientEmail: record.client_email,
    planSelected: record.plan_selected,
    amountPaid: record.amount_paid,
    stripeSessionId: record.stripe_session_id,
    proposalSignedAt: record.proposal_signed_at,
    contractSignedAt: record.contract_signed_at,
    onboardingUrl: record.onboarding_url,
  }))

  return res.status(200).json({ clients })
}
