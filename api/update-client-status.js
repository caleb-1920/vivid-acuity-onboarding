import { findClientById, updateClientById } from './_sheets.js'
import { sendSignedDocuments } from './send-email.js'

const MAX_BODY_BYTES = 4 * 1024 * 1024

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

async function fetchStripeSession(sessionId) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  if (!stripeSecretKey) throw new Error('Stripe secret key is missing on the server.')

  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
  )
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error?.message || `Stripe session lookup failed (${response.status}).`)
  }
  return data
}

function dollarsToCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.round(value * 100)
}

function parsePlanAmount(displayPrice) {
  const match = String(displayPrice || '').match(/\$?([0-9]+(?:\.[0-9]{1,2})?)/)
  return match ? Number(match[1]) : 0
}

function findPlanOption(planOptions, value) {
  if (!Array.isArray(planOptions)) return null
  return planOptions.find((option) => option?.value === value) || null
}

function getExpectedChargeCents(config, planValue) {
  const pricingLineItems = Array.isArray(config?.pricingLineItems) ? config.pricingLineItems : []
  const projectCents = pricingLineItems.reduce((sum, item) => sum + dollarsToCents(item?.amount), 0)
  if (planValue !== 'annual') return projectCents

  const plan = findPlanOption(config?.maintenancePlans, 'annual')
  const projectTotal = typeof config?.projectTotal === 'number' ? config.projectTotal : projectCents / 100
  const dueToday = typeof plan?.dueToday === 'number' ? plan.dueToday : 0
  const annualAmount = dueToday > projectTotal ? dueToday - projectTotal : parsePlanAmount(plan?.displayPrice)
  return projectCents + dollarsToCents(annualAmount)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })

  let body
  try {
    body = await parseJsonBody(req)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : ''
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
  const proposalSignedAt = typeof body?.proposalSignedAt === 'string' ? body.proposalSignedAt.trim() : ''
  const contractSignedAt = typeof body?.contractSignedAt === 'string' ? body.contractSignedAt.trim() : ''
  const proposalSigImage = typeof body?.proposalSigImage === 'string' ? body.proposalSigImage : ''
  const contractSigImage = typeof body?.contractSigImage === 'string' ? body.contractSigImage : ''
  const ownerSigImage = typeof body?.ownerSigImage === 'string' ? body.ownerSigImage : ''
  const fallbackConfig = body?.fallbackConfig && typeof body.fallbackConfig === 'object' ? body.fallbackConfig : null

  if (!clientId) return res.status(400).json({ error: 'clientId is required.' })
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' })

  // Try Sheets first. If unavailable (no credentials, network error, etc.) AND
  // the frontend supplied a fallbackConfig, proceed without Sheets so the email
  // still goes out — Sheets persistence is best-effort, the email is the
  // user-facing deliverable. Stripe verification below is what actually gates
  // legitimacy, not Sheets presence.
  let record = null
  let sheetsAvailable = true
  let sheetsError = null
  try {
    record = await findClientById(clientId)
  } catch (err) {
    sheetsAvailable = false
    sheetsError = err.message
  }

  if (!record) {
    if (!fallbackConfig) {
      return res.status(sheetsAvailable ? 404 : 500).json({
        error: sheetsAvailable
          ? 'Client not found.'
          : `Sheets unavailable and no fallbackConfig provided: ${sheetsError}`,
      })
    }
    // Synthesize a record-shaped object from the frontend payload.
    record = {
      client_id: clientId,
      client_name: fallbackConfig.clientName || '',
      client_email: fallbackConfig.clientEmail || '',
      business_name: fallbackConfig.businessName || '',
      business_location: fallbackConfig.businessLocation || '',
      proposal_signed_at: '',
      contract_signed_at: '',
      status: 'pending',
      stripe_session_id: '',
      config: fallbackConfig.config || {},
    }
  }

  let session
  try {
    session = await fetchStripeSession(sessionId)
  } catch (err) {
    return res.status(502).json({ error: err.message })
  }

  if (session.payment_status !== 'paid') {
    return res.status(409).json({ error: 'Stripe payment is not yet marked as paid.' })
  }

  const metadataClientId = session.metadata?.clientId || ''
  if (!metadataClientId || metadataClientId !== clientId) {
    return res.status(403).json({ error: 'Stripe session metadata clientId does not match request.' })
  }

  const config = record.config || {}
  const planValue = session.metadata?.planValue || ''
  const planShortLabel = session.metadata?.planShortLabel || ''
  const planOption = findPlanOption(config.maintenancePlans, planValue)
  if (!planOption) return res.status(400).json({ error: 'Stripe session plan is not valid for this client.' })

  if (session.metadata?.customAmount !== 'true') {
    const expectedCents = getExpectedChargeCents(config, planValue)
    if (expectedCents <= 0) {
      return res.status(400).json({ error: 'Stored pricing configuration is invalid.' })
    }
    if (Number(session.amount_total || 0) !== expectedCents) {
      return res.status(409).json({
        error: 'Stripe session amount does not match the stored client pricing.',
      })
    }
  }

  const amountPaid = ((session.amount_total || 0) / 100).toFixed(2)
  const paidAt = new Date().toISOString()
  const finalProposalSignedAt = proposalSignedAt || record.proposal_signed_at
  const finalContractSignedAt = contractSignedAt || record.contract_signed_at

  if (!finalProposalSignedAt || !finalContractSignedAt) {
    return res.status(400).json({ error: 'Proposal and agreement signatures are required.' })
  }

  let alreadyFinalized = false
  if (record.status === 'paid' && record.stripe_session_id === sessionId) {
    alreadyFinalized = true
  } else {
    try {
      await updateClientById(clientId, {
        status: 'paid',
        paid_at: paidAt,
        plan_selected: planValue || planShortLabel,
        amount_paid: amountPaid,
        stripe_session_id: sessionId,
        proposal_signed_at: finalProposalSignedAt,
        contract_signed_at: finalContractSignedAt,
      })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  let emailResult
  try {
    emailResult = await sendSignedDocuments({
      clientId: record.client_id,
      clientName: record.client_name,
      clientEmail: record.client_email,
      businessName: record.business_name,
      businessLocation: record.business_location,
      governingState: config.governingState || 'Michigan',
      planValue,
      planShortLabel: planShortLabel || planOption.shortLabel || '',
      paymentAmount: amountPaid,
      stripeSessionId: sessionId,
      proposalSignedAt: finalProposalSignedAt,
      contractSignedAt: finalContractSignedAt,
      proposalCards: Array.isArray(config.proposalCards) ? config.proposalCards : [],
      contractSections: Array.isArray(config.contractSections) ? config.contractSections : [],
      pricingLineItems: Array.isArray(config.pricingLineItems) ? config.pricingLineItems : [],
      projectTotal: typeof config.projectTotal === 'number' ? config.projectTotal : 0,
      satisfactionGuaranteeMonths:
        typeof config.satisfactionGuaranteeMonths === 'number' ? config.satisfactionGuaranteeMonths : 3,
      proposalSigImage,
      contractSigImage,
      ownerSigImage,
    }, req)
  } catch (err) {
    return res.status(502).json({ error: err.message, details: err.details })
  }

  return res.status(200).json({
    success: true,
    alreadyFinalized,
    clientId,
    paidAt,
    amountPaid,
    planValue,
    email: emailResult,
  })
}
