const VALID_RETAINERS = new Set(['none', 'monthly', 'annual'])

const PLAN_DETAILS = {
  none: {
    shortLabel: 'No Maintenance',
    detail: '$500 due today for the completed logo and website project.',
    coverage: 'Project delivery only with no ongoing maintenance coverage.',
  },
  monthly: {
    shortLabel: 'Monthly - $30/mo',
    detail: '$500 due today. Monthly maintenance of $30 begins May 1, 2026.',
    coverage: 'Month-to-month maintenance begins May 1, 2026.',
  },
  annual: {
    shortLabel: 'Annual - $300/yr',
    detail: '$800 due today: $500 project fee plus $300 annual maintenance.',
    coverage: 'Coverage runs from May 1, 2026 through May 1, 2027.',
  },
}

function json(res, status, payload) {
  return res.status(status).json(payload)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' })

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  const sessionId = typeof req.query?.session_id === 'string' ? req.query.session_id.trim() : ''

  if (!stripeSecretKey) {
    return json(res, 500, { error: 'Stripe secret key is missing. Add STRIPE_SECRET_KEY on the server.' })
  }

  if (!sessionId) return json(res, 400, { error: 'A Stripe session_id is required.' })

  try {
    const response = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
        },
      }
    )

    const data = await response.json()

    if (!response.ok) {
      return json(res, response.status, {
        error: data?.error?.message || 'Unable to fetch Stripe Checkout session.',
      })
    }

    if (data.payment_status !== 'paid') {
      return json(res, 409, { error: 'Stripe payment is not marked as paid yet.' })
    }

    const retainer = typeof data.metadata?.retainer === 'string' ? data.metadata.retainer : 'none'
    if (!VALID_RETAINERS.has(retainer)) {
      return json(res, 400, { error: 'Stripe session metadata is missing the selected plan.' })
    }

    return json(res, 200, {
      id: data.id,
      clientName: data.metadata?.clientName || '',
      retainer,
      amountTotal: ((data.amount_total || 0) / 100).toFixed(2),
      paymentStatus: data.payment_status,
      plan: PLAN_DETAILS[retainer],
    })
  } catch (error) {
    return json(res, 500, { error: error.message || 'Unable to reach Stripe.' })
  }
}
