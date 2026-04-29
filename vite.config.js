import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import createCheckoutSessionHandler from './api/create-checkout-session.js'
import checkoutSessionHandler from './api/checkout-session.js'
import sendEmailHandler from './api/send-email.js'
import parseTranscriptHandler from './api/parse-transcript.js'
import createClientHandler from './api/create-client.js'
import clientConfigHandler from './api/client-config.js'
import updateClientStatusHandler from './api/update-client-status.js'
import listClientsHandler from './api/list-clients.js'
import approveClientHandler from './api/approve-client.js'
import adminPingHandler from './api/admin-ping.js'

// Dev-only demo client — returned by /api/client-config?client=demo so the
// onboarding flow can be exercised locally without Google Sheets / Anthropic
// credentials. Never deployed (this wrapper lives only in vite.config.js).
function buildDemoClientPayload() {
  const monthlyStartIso = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
  return {
    clientId: 'demo',
    status: 'pending',
    createdAt: new Date().toISOString(),
    clientName: 'Demo Client',
    businessName: 'Demo Business',
    businessLocation: 'Demoville, MI',
    clientEmail: 'demo@example.com',
    ownerName: 'Caleb Hingos',
    companyName: 'Vivid Acuity, LLC',
    onboardingUrl: 'http://127.0.0.1:3000/?client=demo',
    config: {
      governingState: 'Michigan',
      proposalCards: [
        {
          icon: '🎨',
          title: 'Custom Logo Design',
          items: [
            'A brand new logo designed from scratch.',
            'Delivered in every file format needed for web and print.',
          ],
        },
        {
          icon: '💻',
          title: 'Website Design and Development',
          items: [
            'A fully custom website built from the ground up.',
            'Responsive across phones, tablets, and desktops.',
            'Fast-loading and professional throughout.',
          ],
        },
      ],
      pricingLineItems: [
        { label: 'Setup Fee', amount: 100 },
        { label: 'Custom Logo Design', amount: 150 },
        { label: 'Website Design and Development', amount: 250 },
        { label: 'Domain Cost', amount: 12 },
      ],
      projectTotal: 512,
      maintenancePlans: [
        {
          value: 'none',
          label: 'None',
          sub: 'No maintenance plan selected',
          shortLabel: 'No Maintenance',
          displayPrice: '$0',
          dueToday: 512,
          detail: '$512 due today for the completed logo and website project, including the domain cost.',
          followUp: 'No recurring maintenance charges will be scheduled.',
          coverage: 'Project delivery only with no ongoing maintenance coverage.',
          badge: '',
        },
        {
          value: 'monthly',
          label: 'Monthly',
          sub: 'First charge in 60 days',
          shortLabel: 'Monthly - $30/mo',
          displayPrice: '$30/mo',
          dueToday: 512,
          detail: '$512 due today, including the domain cost. Monthly maintenance of $30 begins in 60 days.',
          followUp: '$30/month begins in 60 days.',
          coverage: 'Month-to-month maintenance.',
          badge: '',
        },
        {
          value: 'annual',
          label: 'Annual',
          sub: 'Coverage for 12 months',
          shortLabel: 'Annual - $300/yr',
          displayPrice: '$300/yr',
          dueToday: 812,
          detail: '$812 due today: $512 project fee plus $300 annual maintenance.',
          followUp: 'Annual maintenance covers the next 12 months.',
          coverage: 'Coverage runs for 12 months.',
          badge: 'Save $60',
        },
      ],
      contractSections: [
        { title: '1. Parties', content: 'Demo agreement between Vivid Acuity, LLC and Demo Business.' },
        { title: '2. Scope of Work', content: 'Custom logo and website per the proposal above.' },
        { title: '3. Project Fees', content: 'One-time project total: $512, due upon signing.' },
        { title: '4. Ongoing Maintenance', content: 'Optional monthly ($30) or annual ($300) maintenance.' },
        { title: '5. Payment Terms', content: 'Full balance due on signing.' },
        { title: '6. Intellectual Property', content: 'Rights transfer on full payment.' },
        { title: '7. Revisions', content: 'Up to two revisions included.' },
        { title: '8. Satisfaction Guarantee', content: 'Full refund if not satisfied within 3 months.' },
        { title: '9. Limitation of Liability', content: 'Liability limited to fees paid.' },
        { title: '10. Governing Law', content: 'Governed by the laws of the State of Michigan.' },
      ],
      satisfactionGuaranteeMonths: 3,
      revisionsIncluded: 2,
      revisionHourlyRate: 75,
      monthlyMaintenanceStart: 'in 60 days',
      annualMaintenanceEnd: 'in 12 months',
      monthlyStartIso,
    },
  }
}

async function demoAwareClientConfig(req, res) {
  if ((req.query?.client || '').trim() === 'demo') {
    res.setHeader('Content-Type', 'application/json')
    res.statusCode = 200
    res.end(JSON.stringify(buildDemoClientPayload()))
    return
  }
  return clientConfigHandler(req, res)
}

const apiHandlers = {
  '/api/create-checkout-session': createCheckoutSessionHandler,
  '/api/checkout-session': checkoutSessionHandler,
  '/api/send-email': sendEmailHandler,
  '/api/parse-transcript': parseTranscriptHandler,
  '/api/create-client': createClientHandler,
  '/api/client-config': demoAwareClientConfig,
  '/api/update-client-status': updateClientStatusHandler,
  '/api/list-clients': listClientsHandler,
  '/api/approve-client': approveClientHandler,
  '/api/admin-ping': adminPingHandler,
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
