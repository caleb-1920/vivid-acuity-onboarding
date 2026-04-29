// Vercel Serverless Function — sends signed proposal + agreement to client + owner.

import { requireAdmin } from './_auth.js'

const OWNER_NAME = 'Caleb Hingos'
const COMPANY_NAME = 'Vivid Acuity, LLC'
const OWNER_EMAIL = 'caleb@vividacuity.com'
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS || 'Vivid Acuity <onboarding@resend.dev>'

const MAX_BODY_BYTES = 4 * 1024 * 1024 // 4 MB to comfortably hold inline signature data URLs

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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return entities[char]
  })
}

function formatMoney(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

function extractInlineImage(dataUrl) {
  if (typeof dataUrl !== 'string') return null
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) return null
  const [, contentType, content] = match
  const extension = contentType === 'image/svg+xml' ? 'svg' : contentType.split('/')[1]
  return { contentType, content, extension }
}

function buildSigHtml(cidName) {
  if (cidName) {
    return `<img src="cid:${cidName}" style="max-width:320px;height:80px;display:block;margin:8px 0;object-fit:contain;" />
      <div style="border-bottom:1.5px solid #1a1a1a;margin-bottom:4px;"></div>`
  }
  return '<div style="border-bottom:1.5px solid #1a1a1a;height:40px;margin:8px 0 4px;"></div>'
}

const S = {
  body: 'font-family:Georgia,serif;max-width:700px;margin:0 auto;background:#ffffff;color:#1a1a1a;padding:48px;',
  coName: 'font-family:sans-serif;font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#eb6611;margin-bottom:6px;',
  h1: 'font-family:sans-serif;font-size:22px;color:#1a1a1a;margin:0 0 4px;',
  subtitle: 'font-size:12px;color:#7a7060;margin-bottom:28px;',
  sectionTitle: 'font-family:sans-serif;font-size:13px;font-weight:700;color:#A87C4F;text-transform:uppercase;letter-spacing:0.15em;margin:24px 0 12px;padding-bottom:6px;border-bottom:1px solid rgba(168,124,79,0.25);',
  row: 'display:flex;padding:6px 0;border-bottom:1px solid #f0f0f0;',
  label: 'width:200px;font-size:13px;color:#7a7060;flex-shrink:0;',
  value: 'font-size:14px;font-weight:600;color:#1a1a1a;',
  signed: 'font-size:14px;font-weight:600;color:#2a7a5a;',
  price: 'font-family:sans-serif;font-size:18px;font-weight:700;color:#A87C4F;',
  cardTitle: 'font-family:sans-serif;font-size:15px;font-weight:600;color:#1a1a1a;margin:18px 0 6px;',
  cardItem: 'font-size:13px;color:#444;line-height:1.7;padding:3px 0 3px 16px;',
  dot: 'display:inline-block;width:6px;height:6px;border-radius:50%;background:#A87C4F;margin-right:8px;vertical-align:middle;',
  guarantee: 'background:#f0faf5;border:1px solid #c8e6c9;border-radius:6px;padding:14px;margin:14px 0;font-size:13px;',
  clauseTitle: 'font-family:sans-serif;font-size:12px;font-weight:600;color:#A87C4F;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid rgba(168,124,79,0.15);',
  clauseText: 'font-size:12px;color:#555;line-height:1.75;margin:0;',
  sigBlock: 'margin-top:28px;padding-top:16px;border-top:1px solid #eee;',
  sigLabel: 'font-family:sans-serif;font-size:11px;color:#A87C4F;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:4px;',
  sigName: 'font-family:sans-serif;font-size:12px;color:#1a1a1a;font-weight:600;',
  sigDate: 'font-size:11px;color:#999;margin-top:2px;',
  audit: 'margin-top:32px;padding:16px;background:#f7f7f7;border:1px solid #e3e3e3;border-radius:6px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:#555;line-height:1.6;white-space:pre-wrap;word-break:break-word;',
  auditTitle: 'font-family:sans-serif;font-size:11px;color:#7a7060;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:8px;',
}

function getClientIp(req) {
  const fwd = req.headers?.['x-forwarded-for']
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim()
  if (Array.isArray(fwd) && fwd.length) return String(fwd[0]).trim()
  return req.socket?.remoteAddress || ''
}

function buildAuditBlock({ clientId, stripeSessionId, ip, userAgent, serverTimestamp, proposalSignedAt, contractSignedAt }) {
  const lines = [
    `Server timestamp: ${serverTimestamp}`,
    `Client ID:        ${clientId || '(not provided)'}`,
    `Stripe session:   ${stripeSessionId || '(not provided)'}`,
    `Signer IP:        ${ip || '(unknown)'}`,
    `User-Agent:       ${userAgent || '(unknown)'}`,
    `Proposal signed:  ${proposalSignedAt || '(unknown)'}`,
    `Agreement signed: ${contractSignedAt || '(unknown)'}`,
  ]
  return `<div style="${S.audit}">
  <div style="${S.auditTitle}">Audit Trail</div>
  ${lines.map((line) => escapeHtml(line)).join('<br/>')}
</div>`
}

function buildProposalHtml({
  clientName,
  businessName,
  businessLocation,
  proposalSignedAt,
  now,
  proposalSigCid,
  ownerSigCid,
  proposalCards,
  pricingLineItems,
  projectTotal,
  satisfactionGuaranteeMonths,
  auditHtml,
}) {
  const safeClientName = escapeHtml(clientName)
  const safeBusiness = escapeHtml(businessName)
  const safeLocation = escapeHtml(businessLocation || '')
  const safeProposalSignedAt = escapeHtml(proposalSignedAt)
  const safeNow = escapeHtml(now)
  const guaranteeMonths = Number.isFinite(satisfactionGuaranteeMonths) ? satisfactionGuaranteeMonths : 3

  const cardsHtml = (proposalCards || [])
    .map((card) => {
      const itemsHtml = (card.items || [])
        .map((item) => `<div style="${S.cardItem}"><span style="${S.dot}"></span>${escapeHtml(item)}</div>`)
        .join('')
      return `<div style="${S.cardTitle}">${escapeHtml(card.icon || '')} ${escapeHtml(card.title || '')}</div>${itemsHtml}`
    })
    .join('')

  const pricingRowsHtml = (pricingLineItems || [])
    .map(
      (item) =>
        `<tr><td style="padding:8px 0;font-size:14px;border-bottom:1px solid #f0f0f0;">${escapeHtml(item.label)}</td><td style="padding:8px 0;text-align:right;font-family:sans-serif;font-weight:500;color:#A87C4F;border-bottom:1px solid #f0f0f0;">${formatMoney(item.amount)}</td></tr>`
    )
    .join('')

  return `<div style="${S.body}">
  <div style="${S.coName}">${escapeHtml(COMPANY_NAME)}</div>
  <h1 style="${S.h1}">Project Proposal</h1>
  <div style="${S.subtitle}">Prepared for ${safeClientName} / ${safeBusiness} &mdash; ${safeNow}</div>

  <div style="${S.row}"><div style="${S.label}">Client</div><div style="${S.value}">${safeClientName}</div></div>
  <div style="${S.row}"><div style="${S.label}">Business</div><div style="${S.value}">${safeBusiness}${safeLocation ? `, ${safeLocation}` : ''}</div></div>
  <div style="${S.row}"><div style="${S.label}">Proposal Finalized</div><div style="${S.signed}">&#10003; ${safeProposalSignedAt}</div></div>

  <div style="${S.sectionTitle}">Deliverables</div>
  ${cardsHtml}

  <div style="${S.sectionTitle}">Investment</div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    ${pricingRowsHtml}
    <tr style="background:rgba(168,124,79,0.08);"><td style="padding:10px 0;font-size:15px;font-weight:700;"><strong>One-Time Total</strong></td><td style="padding:10px 0;text-align:right;font-family:sans-serif;font-size:18px;font-weight:700;color:#A87C4F;"><strong>${formatMoney(projectTotal || 0)}</strong></td></tr>
  </table>

  <div style="${S.guarantee}"><strong style="color:#2a7a5a;">100% Satisfaction Guarantee:</strong> If the client is not fully satisfied with the completed work within ${guaranteeMonths} months of launch, ${escapeHtml(COMPANY_NAME)} will issue a full refund of all fees paid. This guarantee is void if the client has materially altered the delivered work.</div>

  <div style="display:flex;gap:36px;flex-wrap:wrap;margin-top:28px;padding-top:16px;border-top:1px solid #eee;">
    <div style="flex:1;min-width:220px;">
      <div style="${S.sigLabel}">Client</div>
      ${buildSigHtml(proposalSigCid)}
      <div style="${S.sigName}">${safeClientName}</div>
      <div style="${S.sigDate}">Signed ${safeProposalSignedAt}</div>
    </div>
    <div style="flex:1;min-width:220px;">
      <div style="${S.sigLabel}">${escapeHtml(COMPANY_NAME)}</div>
      ${buildSigHtml(ownerSigCid)}
      <div style="${S.sigName}">${escapeHtml(OWNER_NAME)} &mdash; ${escapeHtml(COMPANY_NAME)}</div>
      <div style="${S.sigDate}">Applied automatically after payment on ${safeProposalSignedAt}</div>
    </div>
  </div>

  ${auditHtml}
</div>`
}

function buildAgreementHtml({
  clientName,
  businessName,
  contractSignedAt,
  planShortLabel,
  paymentAmount,
  effectiveDate,
  now,
  contractSigCid,
  ownerSigCid,
  contractSections,
  governingState,
  auditHtml,
}) {
  const safeClientName = escapeHtml(clientName)
  const safeBusiness = escapeHtml(businessName)
  const safeContractSignedAt = escapeHtml(contractSignedAt)
  const safePlanShortLabel = escapeHtml(planShortLabel || '')
  const safePaymentAmount = escapeHtml(paymentAmount)
  const safeEffective = escapeHtml(effectiveDate)
  const safeNow = escapeHtml(now)
  const safeGoverningState = escapeHtml(governingState || 'Michigan')

  const clausesHtml = (contractSections || [])
    .map(
      (section) => `
        <div style="margin-bottom:14px;">
          <div style="${S.clauseTitle}">${escapeHtml(section.title || '')}</div>
          <p style="${S.clauseText}">${escapeHtml(section.content || '')}</p>
        </div>`
    )
    .join('')

  return `<div style="${S.body}">
  <div style="${S.coName}">${escapeHtml(COMPANY_NAME)}</div>
  <h1 style="${S.h1}">Service Agreement</h1>
  <div style="${S.subtitle}">${safeBusiness} &mdash; ${safeClientName} &mdash; ${safeNow}</div>

  <div style="${S.row}"><div style="${S.label}">Agreement Finalized</div><div style="${S.signed}">&#10003; ${safeContractSignedAt}</div></div>
  <div style="${S.row}"><div style="${S.label}">Effective Date</div><div style="${S.value}">${safeEffective}</div></div>
  <div style="${S.row}"><div style="${S.label}">Plan Selected</div><div style="${S.value}">${safePlanShortLabel}</div></div>
  <div style="${S.row}"><div style="${S.label}">Payment</div><div style="${S.price}">${safePaymentAmount}</div></div>
  <div style="${S.row}"><div style="${S.label}">Governing Law</div><div style="${S.value}">State of ${safeGoverningState}</div></div>

  <div style="${S.sectionTitle}">Agreement Terms</div>
  <div style="background:#fafafa;border:1px solid #eee;border-radius:6px;padding:24px;margin-bottom:16px;">
    ${clausesHtml}
    <div><div style="${S.clauseTitle}">Effective Date</div><p style="${S.clauseText}">${safeEffective}</p></div>
  </div>

  <div style="${S.sigBlock}">
    <div style="${S.sigLabel}">Client</div>
    ${buildSigHtml(contractSigCid)}
    <div style="${S.sigName}">${safeClientName} &mdash; ${safeBusiness}</div>
    <div style="${S.sigDate}">Signed ${safeContractSignedAt}</div>
  </div>

  <div style="${S.sigBlock}">
    <div style="${S.sigLabel}">${escapeHtml(COMPANY_NAME)}</div>
    ${buildSigHtml(ownerSigCid)}
    <div style="${S.sigName}">${escapeHtml(OWNER_NAME)} &mdash; ${escapeHtml(COMPANY_NAME)}</div>
    <div style="${S.sigDate}">Applied automatically after payment on ${safeContractSignedAt}</div>
  </div>

  ${auditHtml}
</div>`
}

function buildAttachments(images) {
  const attachments = []
  for (const { asset, name } of images) {
    if (!asset) continue
    attachments.push({
      filename: `${name}.${asset.extension}`,
      content: asset.content,
      content_type: asset.contentType,
      disposition: 'inline',
      content_id: name,
    })
  }
  return attachments
}

export async function sendSignedDocuments(body, req) {
  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) throw new Error('Server email configuration is missing.')

  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : ''
  const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : ''
  const clientEmail = typeof body.clientEmail === 'string' ? body.clientEmail.trim() : ''
  const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : ''
  const businessLocation = typeof body.businessLocation === 'string' ? body.businessLocation.trim() : ''
  const governingState = typeof body.governingState === 'string' ? body.governingState.trim() : 'Michigan'
  const planValue = typeof body.planValue === 'string' ? body.planValue.trim() : ''
  const planShortLabel = typeof body.planShortLabel === 'string' ? body.planShortLabel.trim() : ''
  const proposalSignedAt = typeof body.proposalSignedAt === 'string' ? body.proposalSignedAt.trim() : ''
  const contractSignedAt = typeof body.contractSignedAt === 'string' ? body.contractSignedAt.trim() : ''
  const stripeSessionId = typeof body.stripeSessionId === 'string' ? body.stripeSessionId.trim() : ''
  const numericPaymentAmount = Number(body.paymentAmount)

  const proposalCards = Array.isArray(body.proposalCards) ? body.proposalCards : []
  const contractSections = Array.isArray(body.contractSections) ? body.contractSections : []
  const pricingLineItems = Array.isArray(body.pricingLineItems) ? body.pricingLineItems : []
  const projectTotal = typeof body.projectTotal === 'number' ? body.projectTotal : 0
  const satisfactionGuaranteeMonths = typeof body.satisfactionGuaranteeMonths === 'number' ? body.satisfactionGuaranteeMonths : 3

  if (!clientName) throw new Error('clientName is required.')
  if (!businessName) throw new Error('businessName is required.')
  if (!proposalSignedAt || !contractSignedAt) {
    throw new Error('Proposal and agreement signatures are required.')
  }
  if (!Number.isFinite(numericPaymentAmount) || numericPaymentAmount <= 0) {
    throw new Error('Payment amount must be greater than 0.')
  }
  if (!planValue) throw new Error('planValue is required.')

  const now = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })
  const effectiveDate = new Date().toLocaleDateString('en-US', { dateStyle: 'long' })
  const formattedPaymentAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(numericPaymentAmount)

  const proposalSigAsset = extractInlineImage(body.proposalSigImage)
  const contractSigAsset = extractInlineImage(body.contractSigImage)
  const ownerSigAsset = extractInlineImage(body.ownerSigImage)
  const proposalSigCid = proposalSigAsset ? 'proposal-signature' : null
  const contractSigCid = contractSigAsset ? 'contract-signature' : null
  const ownerSigCid = ownerSigAsset ? 'owner-signature' : null

  const auditHtml = buildAuditBlock({
    clientId,
    stripeSessionId,
    ip: getClientIp(req),
    userAgent: req.headers?.['user-agent'] || '',
    serverTimestamp: new Date().toISOString(),
    proposalSignedAt,
    contractSignedAt,
  })

  const proposalHtml = buildProposalHtml({
    clientName,
    businessName,
    businessLocation,
    proposalSignedAt,
    now,
    proposalSigCid,
    ownerSigCid,
    proposalCards,
    pricingLineItems,
    projectTotal,
    satisfactionGuaranteeMonths,
    auditHtml,
  })
  const proposalAttachments = buildAttachments([
    { asset: proposalSigAsset, name: 'proposal-signature' },
    { asset: ownerSigAsset, name: 'owner-signature' },
  ])

  const agreementHtml = buildAgreementHtml({
    clientName,
    businessName,
    contractSignedAt,
    planShortLabel,
    paymentAmount: formattedPaymentAmount,
    effectiveDate,
    now,
    contractSigCid,
    ownerSigCid,
    contractSections,
    governingState,
    auditHtml,
  })
  const agreementAttachments = buildAttachments([
    { asset: contractSigAsset, name: 'contract-signature' },
    { asset: ownerSigAsset, name: 'owner-signature' },
  ])

  const recipients = []
  if (clientEmail) recipients.push(clientEmail)
  if (!recipients.includes(OWNER_EMAIL)) recipients.push(OWNER_EMAIL)

  try {
    const headers = { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' }
    const businessLabel = businessName || clientName

    const [proposalRes, agreementRes] = await Promise.all([
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: recipients,
          subject: `Signed Proposal - ${clientName} / ${businessLabel}`,
          html: proposalHtml,
          attachments: proposalAttachments.length ? proposalAttachments : undefined,
        }),
      }),
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: recipients,
          subject: `Signed Agreement - ${clientName} / ${businessLabel}`,
          html: agreementHtml,
          attachments: agreementAttachments.length ? agreementAttachments : undefined,
        }),
      }),
    ])

    const proposalData = await proposalRes.json().catch(() => ({}))
    const agreementData = await agreementRes.json().catch(() => ({}))

    if (!proposalRes.ok || !agreementRes.ok) {
      const errors = []
      if (!proposalRes.ok) errors.push({ type: 'proposal', error: proposalData })
      if (!agreementRes.ok) errors.push({ type: 'agreement', error: agreementData })
      const err = new Error('One or more emails failed to send.')
      err.details = errors
      throw err
    }

    return {
      success: true,
      proposalId: proposalData.id,
      agreementId: agreementData.id,
      recipients,
    }
  } catch (err) {
    throw err
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireAdmin(req, res)) return undefined

  let body
  try {
    body = await parseJsonBody(req)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  try {
    const result = await sendSignedDocuments(body, req)
    return res.status(200).json(result)
  } catch (err) {
    return res.status(500).json({ error: err.message, details: err.details })
  }
}
