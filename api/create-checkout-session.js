import { requireAdmin } from './_auth.js'
import { findClientById } from './_sheets.js'

const VALID_PLAN_VALUES = new Set(['none', 'monthly', 'annual'])
const VALID_MAINT_MODES = new Set(['one_time', 'recurring_monthly'])
const MIN_TRIAL_LEAD_SECONDS = 48 * 60 * 60 // 48 hours
const MAX_BODY_BYTES = 1 * 1024 * 1024
const MAX_METADATA_VALUE_LEN = 480 // Stripe metadata cap is 500 — leave a small buffer

function json(res, status, payload) {
  return res.status(status).json(payload)
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body
  }

  const contentType = (req.headers?.['content-type'] || '').toLowerCase()
  if (contentType && !contentType.includes('application/json')) return {}

  let totalBytes = 0
  const chunks = []
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buf.length
    if (totalBytes > MAX_BODY_BYTES) throw new Error('Request body too large.')
    chunks.push(buf)
  }
  if (!chunks.length) return {}
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

function dollarsToCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.round(value * 100)
}

function clampMetadata(value) {
  if (typeof value !== 'string') return ''
  return value.length > MAX_METADATA_VALUE_LEN ? value.slice(0, MAX_METADATA_VALUE_LEN) : value
}

function safeBusinessLabel(business) {
  return business && business.length > 0 ? business : 'Project'
}

function firstHeaderValue(value) {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' ? raw.split(',')[0].trim() : ''
}

function getRequestOrigin(req) {
  const host = firstHeaderValue(req.headers?.['x-forwarded-host']) || firstHeaderValue(req.headers?.host) || ''
  const forwardedProto = firstHeaderValue(req.headers?.['x-forwarded-proto'])
  const isLocal = host.startsWith('127.') || host.startsWith('localhost')
  const proto = forwardedProto || (isLocal ? 'http' : 'https')
  return `${proto}://${host}`.replace(/\/$/, '')
}

function parsePlanAmount(displayPrice) {
  const match = String(displayPrice || '').match(/\$?([0-9]+(?:\.[0-9]{1,2})?)/)
  return match ? Number(match[1]) : 0
}

function findPlanOption(planOptions, value) {
  if (!Array.isArray(planOptions)) return null
  return planOptions.find((option) => option?.value === value) || null
}

function buildMaintenanceLineItem(planOption, projectTotal) {
  if (!planOption || planOption.value === 'none') return null

  if (planOption.value === 'monthly') {
    return {
      label: planOption.shortLabel || 'Monthly maintenance',
      amount: parsePlanAmount(planOption.displayPrice),
      mode: 'recurring_monthly',
    }
  }

  if (planOption.value === 'annual') {
    const dueToday = typeof planOption.dueToday === 'number' ? planOption.dueToday : 0
    const annualFromDueToday = dueToday > projectTotal ? dueToday - projectTotal : 0
    return {
      label: planOption.shortLabel || 'Annual maintenance',
      amount: annualFromDueToday || parsePlanAmount(planOption.displayPrice),
      mode: 'one_time',
    }
  }

  return null
}

function buildLineItems({ pricingLineItems, maintenanceLineItem, customAmount, businessName, clientName }) {
  if (customAmount !== null) {
    return [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${safeBusinessLabel(businessName)} - Custom Total`,
            description: `Custom payment for ${clientName} / ${safeBusinessLabel(businessName)}.`,
          },
          unit_amount: dollarsToCents(customAmount),
        },
        quantity: 1,
      },
    ]
  }

  const items = []
  for (const lineItem of pricingLineItems) {
    items.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${safeBusinessLabel(businessName)} - ${lineItem.label}`,
          description: `${lineItem.label} for ${clientName} / ${safeBusinessLabel(businessName)}.`,
        },
        unit_amount: dollarsToCents(lineItem.amount),
      },
      quantity: 1,
    })
  }

  if (maintenanceLineItem) {
    const base = {
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${safeBusinessLabel(businessName)} - ${maintenanceLineItem.label}`,
          description: maintenanceLineItem.label,
        },
        unit_amount: dollarsToCents(maintenanceLineItem.amount),
      },
      quantity: 1,
    }
    if (maintenanceLineItem.mode === 'recurring_monthly') {
      base.price_data.recurring = { interval: 'month' }
    }
    items.push(base)
  }

  return items
}

function getMode({ planValue, customAmount, maintenanceLineItem }) {
  if (customAmount !== null) return 'payment'
  if (planValue === 'monthly' && maintenanceLineItem?.mode === 'recurring_monthly') {
    return 'subscription'
  }
  return 'payment'
}

function resolveTrialEnd(monthlyStartIso) {
  const parsedMs = monthlyStartIso ? Date.parse(monthlyStartIso) : NaN
  const earliestSec = Math.floor(Date.now() / 1000) + MIN_TRIAL_LEAD_SECONDS
  if (!Number.isFinite(parsedMs)) return earliestSec

  const requestedSec = Math.floor(parsedMs / 1000)
  return requestedSec < earliestSec ? earliestSec : requestedSec
}

function buildParams({
  origin,
  clientId,
  clientName,
  businessName,
  planValue,
  planShortLabel,
  pricingLineItems,
  maintenanceLineItem,
  monthlyStartIso,
  customAmount,
  proposalSignedAt,
  contractSignedAt,
}) {
  const params = new URLSearchParams()
  const mode = getMode({ planValue, customAmount, maintenanceLineItem })
  params.set('mode', mode)
  params.set('ui_mode', 'custom')
  params.set('return_url', `${origin}/?client=${encodeURIComponent(clientId)}&checkout=success&session_id={CHECKOUT_SESSION_ID}`)
  params.set('payment_method_types[0]', 'card')
  params.set('metadata[clientId]', clampMetadata(clientId))
  params.set('metadata[clientName]', clampMetadata(clientName))
  params.set('metadata[planValue]', clampMetadata(planValue))
  params.set('metadata[planShortLabel]', clampMetadata(planShortLabel || ''))
  params.set('metadata[proposalSignedAt]', clampMetadata(proposalSignedAt))
  params.set('metadata[contractSignedAt]', clampMetadata(contractSignedAt))
  if (customAmount !== null) params.set('metadata[customAmount]', 'true')

  if (mode === 'subscription' && customAmount === null) {
    const trialEnd = resolveTrialEnd(monthlyStartIso)
    params.set('subscription_data[trial_end]', String(trialEnd))
    params.set('subscription_data[metadata][clientId]', clampMetadata(clientId))
    params.set('subscription_data[metadata][planValue]', clampMetadata(planValue))
    params.set('subscription_data[metadata][clientName]', clampMetadata(clientName))
  }

  buildLineItems({ pricingLineItems, maintenanceLineItem, customAmount, businessName, clientName }).forEach((item, index) => {
    params.set(`line_items[${index}][quantity]`, String(item.quantity))
    params.set(`line_items[${index}][price_data][currency]`, item.price_data.currency)
    params.set(`line_items[${index}][price_data][product_data][name]`, item.price_data.product_data.name)
    params.set(
      `line_items[${index}][price_data][product_data][description]`,
      item.price_data.product_data.description
    )
    params.set(`line_items[${index}][price_data][unit_amount]`, String(item.price_data.unit_amount))

    if (item.price_data.recurring) {
      params.set(
        `line_items[${index}][price_data][recurring][interval]`,
        item.price_data.recurring.interval
      )
    }
  })

  return params
}

function validateLineItems(items) {
  if (!Array.isArray(items) || items.length === 0) return 'pricingLineItems must be a non-empty array.'
  for (const item of items) {
    if (!item || typeof item !== 'object') return 'pricingLineItems contains an invalid entry.'
    if (typeof item.label !== 'string' || !item.label.trim()) return 'pricingLineItems entry is missing a label.'
    if (typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount <= 0) {
      return `pricingLineItems entry "${item.label}" has an invalid amount.`
    }
  }
  return null
}

function validateMaintenanceLineItem(item, planValue) {
  if (planValue === 'none') {
    if (item) return 'maintenanceLineItem must be null when planValue is "none".'
    return null
  }
  if (!item || typeof item !== 'object') return 'maintenanceLineItem is required when a plan is selected.'
  if (typeof item.label !== 'string' || !item.label.trim()) return 'maintenanceLineItem.label is required.'
  if (typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount <= 0) {
    return 'maintenanceLineItem.amount must be a positive number.'
  }
  if (!VALID_MAINT_MODES.has(item.mode)) return 'maintenanceLineItem.mode must be one_time or recurring_monthly.'
  if (planValue === 'monthly' && item.mode !== 'recurring_monthly') {
    return 'planValue "monthly" requires maintenanceLineItem.mode "recurring_monthly".'
  }
  if (planValue === 'annual' && item.mode !== 'one_time') {
    return 'planValue "annual" requires maintenanceLineItem.mode "one_time".'
  }
  return null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' })

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  if (!stripeSecretKey) {
    return json(res, 500, { error: 'Stripe secret key is missing. Add STRIPE_SECRET_KEY on the server.' })
  }

  const body = await parseJsonBody(req).catch(() => ({}))
  const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : ''
  const planValue = typeof body?.planValue === 'string' ? body.planValue.trim() : ''
  const proposalSignedAt = typeof body?.proposalSignedAt === 'string' ? body.proposalSignedAt.trim() : ''
  const contractSignedAt = typeof body?.contractSignedAt === 'string' ? body.contractSignedAt.trim() : ''
  const customAmountRaw = body?.customAmount
  const customAmount =
    typeof customAmountRaw === 'number' && Number.isFinite(customAmountRaw) && customAmountRaw > 0
      ? Math.round(customAmountRaw)
      : null

  if (!clientId) return json(res, 400, { error: 'clientId is required.' })
  if (customAmount !== null && !requireAdmin(req, res)) return undefined
  if (!VALID_PLAN_VALUES.has(planValue)) {
    return json(res, 400, { error: 'A valid planValue is required (none|monthly|annual).' })
  }
  if (!proposalSignedAt || !contractSignedAt) {
    return json(res, 400, { error: 'Proposal and agreement signatures are required before payment.' })
  }

  let record
  try {
    record = await findClientById(clientId)
  } catch (err) {
    return json(res, 500, { error: err.message || 'Unable to read client configuration.' })
  }
  if (!record) return json(res, 404, { error: 'Client not found.' })
  if (record.status === 'paid') {
    return json(res, 409, { error: 'This client is already marked paid.' })
  }

  const config = record.config || {}
  const clientName = record.client_name || ''
  const businessName = record.business_name || ''
  const pricingLineItems = Array.isArray(config.pricingLineItems) ? config.pricingLineItems : null
  const projectTotal = typeof config.projectTotal === 'number' ? config.projectTotal : 0
  const planOption = findPlanOption(config.maintenancePlans, planValue)
  const planShortLabel = planOption?.shortLabel || ''
  const maintenanceLineItem = buildMaintenanceLineItem(planOption, projectTotal)
  const monthlyStartIso = typeof config.monthlyStartIso === 'string' ? config.monthlyStartIso.trim() : ''

  if (!clientName) return json(res, 400, { error: 'Stored clientName is missing.' })
  if (!businessName) return json(res, 400, { error: 'Stored businessName is missing.' })
  if (!planOption) return json(res, 400, { error: 'Selected plan is not available for this client.' })

  if (customAmount === null) {
    const lineItemError = validateLineItems(pricingLineItems)
    if (lineItemError) return json(res, 400, { error: lineItemError })
    const maintError = validateMaintenanceLineItem(maintenanceLineItem, planValue)
    if (maintError) return json(res, 400, { error: maintError })
  }

  const origin = getRequestOrigin(req)

  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: buildParams({
        origin,
        clientId,
        clientName,
        businessName,
        planValue: planValue || 'none',
        planShortLabel,
        pricingLineItems: pricingLineItems || [],
        maintenanceLineItem,
        monthlyStartIso,
        customAmount,
        proposalSignedAt,
        contractSignedAt,
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      return json(res, response.status, {
        error: data?.error?.message || 'Stripe Checkout session creation failed.',
      })
    }

    return json(res, 200, {
      id: data.id,
      clientSecret: data.client_secret,
      livemode: Boolean(data.livemode),
    })
  } catch (error) {
    return json(res, 500, { error: error.message || 'Unable to reach Stripe.' })
  }
}
