import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import createCheckoutSessionHandler from './api/create-checkout-session.js'
import checkoutSessionHandler from './api/checkout-session.js'
import sendEmailHandler from './api/send-email.js'

const apiHandlers = {
  '/api/create-checkout-session': createCheckoutSessionHandler,
  '/api/checkout-session': checkoutSessionHandler,
  '/api/send-email': sendEmailHandler,
}

function withJsonHelpers(res) {
  res.status = (code) => {
    res.statusCode = code
    return res
  }

  res.json = (payload) => {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json')
    }

    res.end(JSON.stringify(payload))
    return res
  }

  return res
}

async function readJsonBody(req) {
  const chunks = []

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
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

function localApiPlugin() {
  return {
    name: 'local-api-routes',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = new URL(req.originalUrl || req.url || '/', 'http://127.0.0.1')
        const handler = apiHandlers[requestUrl.pathname]

        if (!handler) {
          next()
          return
        }

        try {
          req.query = Object.fromEntries(requestUrl.searchParams.entries())
          req.body = ['POST', 'PUT', 'PATCH'].includes(req.method || '')
            ? await readJsonBody(req)
            : {}

          await handler(req, withJsonHelpers(res))
        } catch (error) {
          withJsonHelpers(res).status(500).json({
            error: error instanceof Error ? error.message : 'Local API route failed.',
          })
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
    plugins: [react(), localApiPlugin()],
    server: {
      host: '127.0.0.1',
      port: 3000,
      strictPort: true,
    },
    preview: {
      host: '127.0.0.1',
      port: 3000,
      strictPort: true,
    },
  }
})
