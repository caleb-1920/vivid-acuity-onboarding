const VALID_RETAINERS = new Set(['none', 'monthly', 'annual'])
const MONTHLY_START_AT = '2026-05-01T00:00:00-07:00'

function json(res, status, payload) {
  return res.status(status).json(payload)
}

const MAX_BODY_BYTES = 1 * 1024 * 1024 // 1 MB

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body
  }

  const contentType = (req.headers?.['content-type'] || '').toLowerCase()
  if (contentType && !contentType.includes('application/json')) {
    return {}
  }

  let totalBytes = 0
  const chunks = []

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buf.length
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error('Request body too large.')
    }
    chunks.push(buf)
  }

  if (!chunks.length) return {}

  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}

  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function buildLineItems(retainer) {
  const projectFeeItem = {
    price_data: {
      currency: 'usd',
      product_data: {
        name: 'Top View Taxidermy website and logo project',
        description: 'Custom logo design and website design/development for Top View Taxidermy.',
      },
      unit_amount: 50000,
    },
    quantity: 1,
  }

  const domainCostItem = {
    price_data: {
      currency: 'usd',
      product_data: {
        name: 'Top View Taxidermy domain cost',
        description: 'Annual domain registration cost paid at project completion.',
      },
      unit_amount: 1200,
    },
    quantity: 1,
  }

  if (retainer === 'annual') {
    return [
      projectFeeItem,
      domainCostItem,
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Annual maintenance plan',
            description: 'Maintenance coverage from May 1, 2026 through May 1, 2027.',
          },
          unit_amount: 30000,
        },
        quantity: 1,
      },
    ]
  }

  if (retainer === 'monthly') {
    return [
      projectFeeItem,
      domainCostItem,
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Monthly maintenance plan',
            description: 'Monthly maintenance begins on May 1, 2026.',
          },
          recurring: { interval: 'month' },
          unit_amount: 3000,
        },
        quantity: 1,
      },
    ]
  }

  return [projectFeeItem, domainCostItem]
}

function getMode(retainer) {
  return retainer === 'monthly' ? 'subscription' : 'payment'
}

function buildParams({ origin, clientName, retainer, proposalSignedAt, contractSignedAt }) {
  const params = new URLSearchParams()
  const mode = getMode(retainer)
  params.set('mode', mode)
  params.set('ui_mode', 'custom')
  params.set('return_url', `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`)
  params.set('payment_method_types[0]', 'card')
  params.set('metadata[clientName]', clientName)
  params.set('metadata[retainer]', retainer)
  params.set('metadata[proposalSignedAt]', proposalSignedAt)
  params.set('metadata[contractSignedAt]', contractSignedAt)

  if (retainer === 'monthly') {
    const trialEnd = Math.floor(new Date(MONTHLY_START_AT).getTime() / 1000)
    params.set('subscription_data[trial_end]', String(trialEnd))
    params.set('subscription_data[metadata][retainer]', retainer)
    params.set('subscription_data[metadata][clientName]', clientName)
  }

  buildLineItems(retainer).forEach((item, index) => {
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' })

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  if (!stripeSecretKey) {
    return json(res, 500, { error: 'Stripe secret key is missing. Add STRIPE_SECRET_KEY on the server.' })
  }

  const body = await parseJsonBody(req)
  const clientName = typeof body?.clientName === 'string' ? body.clientName.trim() : ''
  const retainer = typeof body?.retainer === 'string' ? body.retainer.trim() : ''
  const proposalSignedAt =
    typeof body?.proposalSignedAt === 'string' ? body.proposalSignedAt.trim() : ''
  const contractSignedAt =
    typeof body?.contractSignedAt === 'string' ? body.contractSignedAt.trim() : ''

  if (!clientName) return json(res, 400, { error: 'Client name is required.' })
  if (!VALID_RETAINERS.has(retainer)) return json(res, 400, { error: 'A valid maintenance plan is required.' })
  if (!proposalSignedAt || !contractSignedAt) {
    return json(res, 400, { error: 'Proposal and agreement signatures are required before payment.' })
  }

  const origin =
    req.headers.origin ||
    `https://${req.headers['x-forwarded-host'] || req.headers.host || ''}`.replace(/\/$/, '')

  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: buildParams({ origin, clientName, retainer, proposalSignedAt, contractSignedAt }),
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
