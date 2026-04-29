import crypto from 'node:crypto'

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

export function requireAdmin(req, res) {
  const expected = process.env.ADMIN_API_KEY
  if (!expected) {
    res.status(500).json({ error: 'ADMIN_API_KEY is not configured on the server.' })
    return false
  }

  const provided = req.headers?.['x-admin-key']
  if (typeof provided !== 'string' || !timingSafeEqual(provided, expected)) {
    res.status(401).json({ error: 'Unauthorized.' })
    return false
  }

  return true
}
