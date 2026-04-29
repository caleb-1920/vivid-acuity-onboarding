import { requireAdmin } from './_auth.js'

const MAX_BODY_BYTES = 2 * 1024 * 1024
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const ANTHROPIC_VERSION = '2023-06-01'

const CLIENT_CONFIG_SCHEMA = {
  type: 'object',
  required: [
    'clientName',
    'businessName',
    'clientEmail',
    'config',
  ],
  properties: {
    clientName: { type: 'string', description: 'Full name of the primary client contact.' },
    businessName: { type: 'string', description: 'Legal or doing-business-as name of the client business.' },
    businessLocation: { type: 'string', description: 'City and state/region of the client business, e.g. "Kenosha, Wisconsin".' },
    clientEmail: { type: 'string', description: 'Best email address for the client. If unknown, use an empty string.' },
    governingState: { type: 'string', description: 'State whose law governs the agreement. Default to "Michigan".' },
    config: {
      type: 'object',
      required: [
        'proposalCards',
        'pricingLineItems',
        'projectTotal',
        'maintenancePlans',
        'contractSections',
        'satisfactionGuaranteeMonths',
        'revisionsIncluded',
        'revisionHourlyRate',
        'monthlyMaintenanceStart',
        'annualMaintenanceEnd',
        'monthlyStartIso',
      ],
      properties: {
        proposalCards: {
          type: 'array',
          description: 'Each card is one deliverable or service category discussed in the transcript. Omit any category not discussed.',
          items: {
            type: 'object',
            required: ['icon', 'title', 'items'],
            properties: {
              icon: { type: 'string', description: 'Single emoji that represents this deliverable.' },
              title: { type: 'string' },
              items: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        pricingLineItems: {
          type: 'array',
          description: 'Itemized one-time charges. Each entry has a human label and a USD amount in dollars (not cents).',
          items: {
            type: 'object',
            required: ['label', 'amount'],
            properties: {
              label: { type: 'string' },
              amount: { type: 'number', description: 'Dollars, integer where possible.' },
            },
          },
        },
        projectTotal: {
          type: 'number',
          description: 'Sum of all pricingLineItems in dollars.',
        },
        maintenancePlans: {
          type: 'array',
          description: 'Always include exactly three options with values "none", "monthly", "annual" in this order. Use the prices and coverage terms discussed in the transcript. If a tier was not discussed at all, use 0 for the amount and put "TBD" in the display strings so the admin sees what is missing.',
          items: {
            type: 'object',
            required: ['value', 'label', 'sub', 'shortLabel', 'displayPrice', 'dueToday', 'detail', 'followUp', 'coverage'],
            properties: {
              value: { type: 'string', enum: ['none', 'monthly', 'annual'] },
              label: { type: 'string' },
              sub: { type: 'string' },
              shortLabel: { type: 'string' },
              displayPrice: { type: 'string' },
              dueToday: { type: 'number', description: 'Total dollars due today if this plan is selected.' },
              detail: { type: 'string' },
              followUp: { type: 'string' },
              coverage: { type: 'string' },
              badge: { type: 'string', description: 'Optional badge such as "Save $60". Use empty string if none.' },
            },
          },
        },
        contractSections: {
          type: 'array',
          description: 'Exactly 10 numbered clauses adapted to the transcript: 1. Parties, 2. Scope of Work, 3. Project Fees, 4. Ongoing Maintenance, 5. Payment Terms, 6. Intellectual Property, 7. Revisions, 8. Satisfaction Guarantee, 9. Limitation of Liability, 10. Governing Law.',
          items: {
            type: 'object',
            required: ['title', 'content'],
            properties: {
              title: { type: 'string', description: 'e.g. "1. Parties"' },
              content: { type: 'string' },
            },
          },
        },
        satisfactionGuaranteeMonths: { type: 'number', description: 'Default 3 unless transcript says otherwise.' },
        revisionsIncluded: { type: 'number', description: 'Default 2 unless transcript says otherwise.' },
        revisionHourlyRate: { type: 'number', description: 'USD per hour. Default 75.' },
        monthlyMaintenanceStart: { type: 'string', description: 'Display string, e.g. "May 1, 2026".' },
        annualMaintenanceEnd: { type: 'string', description: 'Display string, e.g. "May 1, 2027".' },
        monthlyStartIso: { type: 'string', description: 'ISO 8601 datetime when monthly maintenance begins. Used as Stripe trial_end. Must be at least 48 hours in the future.' },
      },
    },
  },
}

const SYSTEM_PROMPT = `You are extracting a structured client onboarding configuration from a sales-call transcript for Vivid Acuity, LLC (owner: Caleb Hingos).

The work could be ANY kind of service — web design, videography, photography, consulting, copywriting, branding, audio production, training, retainer work, etc. Do not assume the project is web/logo work unless the transcript explicitly says so.

Rules:
1. Follow the transcript exactly. Never invent pricing, services, dates, or terms not discussed. If something was not discussed, use 0 / empty string / "TBD" rather than guessing — the admin will fill in missing pieces before publishing.
2. proposalCards: derive each card from a service or deliverable that was actually discussed in the transcript. The titles, items, and icons should reflect the real scope of work — for a videographer you might have "Wedding Highlight Reel" and "Color Grading"; for a consultant, "Discovery Workshop" and "Strategy Document". Do NOT default to logo/website categories unless the transcript actually discusses them.
3. pricingLineItems: list only the one-time charges actually discussed in the transcript (label + dollar amount). If pricing was not discussed, return a single placeholder entry with label "TBD - confirm with client" and amount 0 so the admin can fill it in.
4. projectTotal: the sum of pricingLineItems.
5. maintenancePlans: always emit three entries (none, monthly, annual). Use whatever recurring/maintenance terms were discussed. If a tier was not discussed, set its amount to 0 and use "TBD" in the display strings.
6. contractSections: emit all 10 numbered clauses (1. Parties, 2. Scope of Work, 3. Project Fees, 4. Ongoing Maintenance, 5. Payment Terms, 6. Intellectual Property, 7. Revisions, 8. Satisfaction Guarantee, 9. Limitation of Liability, 10. Governing Law). The CONTENT of each clause must be specific to this transcript — clause 2 ("Scope of Work") in particular must describe the actual deliverables discussed, not generic web/logo work. Use transcript-specific values: client name, business name, business location, owner = Caleb Hingos / Vivid Acuity, LLC, governing state.
7. Set monthlyStartIso to a date at least 48 hours from today, formatted as a full ISO 8601 datetime with timezone.
8. Use a single emoji for each proposalCards icon, chosen to reflect that specific deliverable.
9. Default governingState to "Michigan" unless the transcript specifies otherwise.

You MUST call the extract_client_config tool with the parsed values. Do not respond with prose.`

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })
  if (!requireAdmin(req, res)) return

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured.' })

  let body
  try {
    body = await parseJsonBody(req)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  const transcript = typeof body?.transcript === 'string' ? body.transcript : ''
  if (transcript.trim().length < 50) {
    return res.status(400).json({ error: 'Transcript is required and must be substantive (>= 50 chars).' })
  }

  const payload = {
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      {
        name: 'extract_client_config',
        description: 'Returns the structured client onboarding configuration extracted from the transcript.',
        input_schema: CLIENT_CONFIG_SCHEMA,
      },
    ],
    tool_choice: { type: 'tool', name: 'extract_client_config' },
    messages: [
      { role: 'user', content: `Transcript:\n\n${transcript}` },
    ],
  }

  let response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    return res.status(502).json({ error: `Unable to reach Anthropic: ${err.message}` })
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    return res.status(response.status).json({
      error: data?.error?.message || `Anthropic API error (${response.status}).`,
    })
  }

  const toolUse = Array.isArray(data?.content)
    ? data.content.find((block) => block?.type === 'tool_use' && block?.name === 'extract_client_config')
    : null

  if (!toolUse || !toolUse.input || typeof toolUse.input !== 'object') {
    return res.status(502).json({
      error: 'Anthropic response did not contain a tool_use block for extract_client_config.',
      raw: data,
    })
  }

  const usage = data.usage || {}

  return res.status(200).json({
    parsed: toolUse.input,
    usage: {
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      cacheReadInputTokens: usage.cache_read_input_tokens || 0,
      cacheCreationInputTokens: usage.cache_creation_input_tokens || 0,
    },
  })
}
