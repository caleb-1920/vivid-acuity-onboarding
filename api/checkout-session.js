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
  const clientId = typeof req.query?.client === 'string' ? req.query.client.trim() : ''

  if (!stripeSecretKey) {
    return json(res, 500, { error: 'Stripe secret key is missing. Add STRIPE_SECRET_KEY on the server.' })
  }
  if (!sessionId) return json(res, 400, { error: 'A Stripe session_id is required.' })
  if (!clientId) return json(res, 400, { error: 'A client query param is required.' })

  try {
    const response = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
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

    if (data.metadata?.clientId !== clientId) {
      return json(res, 403, { error: 'Stripe session does not belong to this client.' })
    }

    return json(res, 200, {
      id: data.id,
      clientId: data.metadata?.clientId || '',
      planValue: data.metadata?.planValue || 'none',
      planShortLabel: data.metadata?.planShortLabel || '',
      amountTotal: ((data.amount_total || 0) / 100).toFixed(2),
      paymentStatus: data.payment_status,
    })
  } catch (error) {
    return json(res, 500, { error: error.message || 'Unable to reach Stripe.' })
  }
}
