import { useEffect, useMemo, useRef, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  CheckoutElementsProvider,
  PaymentElement as CheckoutPaymentElement,
  useCheckout,
} from '@stripe/react-stripe-js/checkout'
import './ClientOnboarding.css'

const STRIPE_PUBLISHABLE_KEY = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '').trim()
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null

const OWNER_NAME = 'Caleb Hingos'
const COMPANY_NAME = 'Vivid Acuity, LLC'
const SAVED_SIGNATURE_SRC = '/signature.png?v=1'

const PROGRESS_STEPS = [
  { num: 1, label: 'Proposal' },
  { num: 2, label: 'Agreement' },
  { num: 3, label: 'Payment' },
]

const FALLBACK_PLANS = [
  { value: 'none', label: 'None', sub: '', shortLabel: 'No Maintenance', displayPrice: '$0', dueToday: 0, detail: '', followUp: '', coverage: '', badge: '' },
]

function formatMoney(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return entities[char]
  })
}

function makeStorageKeys(clientId) {
  const safeId = clientId || 'unknown'
  return {
    state: `vivid-acuity-onboarding-state:${safeId}`,
    pendingSession: `vivid-acuity-pending-session:${safeId}`,
    finalizedSessionPrefix: `vivid-acuity-finalized-session:${safeId}:`,
  }
}

function loadStoredOnboardingState(storageKey) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function persistOnboardingState(storageKey, state) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state))
  } catch {
    /* ignore quota errors */
  }
}

function clearCheckoutParams() {
  if (typeof window === 'undefined') return
  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.delete('checkout')
  nextUrl.searchParams.delete('session_id')
  nextUrl.searchParams.delete('canceled')
  window.history.replaceState({}, document.title, `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`)
}

function getStripeKeyMode(key) {
  if (key.startsWith('sk_') || key.startsWith('rk_')) return 'secret_key_error'
  if (key.startsWith('pk_live_')) return 'live'
  if (key.startsWith('pk_test_')) return 'test'
  return 'unknown'
}

async function postClientStatusUpdate(payload) {
  const res = await fetch('/api/update-client-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Failed to record payment status.')
  return data
}

async function toDataUrl(src) {
  const response = await fetch(src)
  const blob = await response.blob()
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result || '')
    reader.onerror = () => reject(new Error('Failed to read saved signature image.'))
    reader.readAsDataURL(blob)
  })
}

async function createCheckoutSession(payload) {
  const res = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Failed to create Stripe checkout session.')
  if (typeof data.clientSecret !== 'string' || !data.clientSecret.trim()) {
    throw new Error(
      'Stripe did not return a client secret. Verify /api/create-checkout-session is deployed and STRIPE_SECRET_KEY is set.'
    )
  }
  return data
}

function findPlanOption(planOptions, value) {
  return planOptions.find((option) => option.value === value) || planOptions[0] || FALLBACK_PLANS[0]
}

function buildMaintenanceLineItem(planOption) {
  if (!planOption || planOption.value === 'none') return null
  if (planOption.value === 'monthly') {
    return {
      label: planOption.shortLabel || 'Monthly maintenance',
      amount: parsePlanRecurringAmount(planOption.displayPrice),
      mode: 'recurring_monthly',
    }
  }
  if (planOption.value === 'annual') {
    const annualAmount = Math.max(0, (planOption.dueToday || 0) - estimateProjectTotalForAnnual(planOption))
    return {
      label: planOption.shortLabel || 'Annual maintenance',
      amount: annualAmount > 0 ? annualAmount : parsePlanAnnualAmount(planOption.displayPrice),
      mode: 'one_time',
    }
  }
  return null
}

function parsePlanRecurringAmount(displayPrice) {
  const match = String(displayPrice || '').match(/\$?([0-9]+(?:\.[0-9]{1,2})?)/)
  return match ? Number(match[1]) : 0
}

function parsePlanAnnualAmount(displayPrice) {
  const match = String(displayPrice || '').match(/\$?([0-9]+(?:\.[0-9]{1,2})?)/)
  return match ? Number(match[1]) : 0
}

function estimateProjectTotalForAnnual(planOption) {
  // Best-effort: annual plan dueToday usually equals project total + annual maintenance.
  // We don't have a direct field, so caller can override via maintenanceLineItem if needed.
  // Prefer to subtract a parsed annual amount from dueToday.
  const parsed = parsePlanAnnualAmount(planOption.displayPrice)
  return parsed > 0 ? Math.max(0, (planOption.dueToday || 0) - parsed) : (planOption.dueToday || 0)
}

function generatePrintableHTML({
  clientName,
  businessName,
  businessLocation,
  proposalCards,
  contractSections,
  pricingLineItems,
  projectTotal,
  proposalSignedAt,
  contractSignedAt,
  proposalSigImage,
  contractSigImage,
  ownerSigImage,
  plan,
  satisfactionGuaranteeMonths,
}) {
  const now = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })
  const effectiveDate = new Date().toLocaleDateString('en-US', { dateStyle: 'long' })

  const sanitizePrintableImageSource = (src) => {
    if (typeof src !== 'string') return ''
    const trimmed = src.trim()
    if (trimmed.startsWith('data:image/')) return trimmed
    if (/^\/[a-zA-Z0-9/_\-.]+(?:\?[a-zA-Z0-9=&._-]+)?$/.test(trimmed)) return trimmed
    return ''
  }

  const buildPrintableSignatureTag = (src) => {
    const safeSrc = sanitizePrintableImageSource(src)
    return safeSrc
      ? `<img src="${escapeHtml(safeSrc)}" style="max-width:320px;height:80px;display:block;margin:8px 0;object-fit:contain;" />`
      : '<div style="border-bottom:1.5px solid #1a1a1a;height:40px;margin:8px 0;"></div>'
  }

  const safeClientName = escapeHtml(clientName)
  const safeBusiness = escapeHtml(businessName)
  const safeLocation = escapeHtml(businessLocation || '')
  const safeProposalSignedAt = escapeHtml(proposalSignedAt)
  const safeContractSignedAt = escapeHtml(contractSignedAt)
  const safeNow = escapeHtml(now)
  const safeEffectiveDate = escapeHtml(effectiveDate)
  const safePlanShortLabel = escapeHtml(plan?.shortLabel || '')
  const safePlanDetail = escapeHtml(plan?.detail || '')
  const safePlanCoverage = escapeHtml(plan?.coverage || '')
  const proposalSigTag = buildPrintableSignatureTag(proposalSigImage)
  const contractSigTag = buildPrintableSignatureTag(contractSigImage)
  const ownerSigTag = buildPrintableSignatureTag(ownerSigImage)
  const guaranteeMonths = Number.isFinite(satisfactionGuaranteeMonths) ? satisfactionGuaranteeMonths : 3

  const pricingRowsHtml = (pricingLineItems || [])
    .map(
      (item) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">${escapeHtml(item.label)}</td><td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:right;">${formatMoney(item.amount)}</td></tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Signed Documents - ${safeClientName}</title>
    <style>
      body { font-family: Georgia, serif; color: #1a1a1a; background: #fff; padding: 48px; max-width: 820px; margin: 0 auto; line-height: 1.6; }
      .co-name { font-family: sans-serif; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase; color: #eb6611; margin-bottom: 6px; }
      h1 { font-family: sans-serif; font-size: 22px; margin: 0 0 4px; }
      .subtitle { font-size: 12px; color: #7a7060; margin-bottom: 28px; }
      .section-title { font-family: sans-serif; font-size: 13px; font-weight: 700; color: #A87C4F; text-transform: uppercase; letter-spacing: 0.15em; margin: 24px 0 12px; padding-bottom: 6px; border-bottom: 1px solid rgba(168,124,79,0.25); }
      .row { display: flex; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
      .label { width: 200px; font-size: 13px; color: #7a7060; flex-shrink: 0; }
      .value { font-size: 14px; font-weight: 600; color: #1a1a1a; }
      .signed { font-size: 14px; font-weight: 600; color: #2a7a5a; }
      .clause { margin-bottom: 14px; }
      .clause-title { font-family: sans-serif; font-size: 12px; font-weight: 600; color: #A87C4F; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
      .sig-block { display: flex; gap: 48px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; }
      .sig-col { flex: 1; }
      .sig-col-label { font-family: sans-serif; font-size: 11px; color: #A87C4F; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 6px; }
      .sig-name { font-family: sans-serif; font-size: 12px; color: #1a1a1a; font-weight: 600; }
      .sig-date { font-size: 11px; color: #999; margin-top: 2px; }
      .page-break { page-break-after: always; }
    </style>
  </head>
  <body>
    <div class="page-break">
      <div class="co-name">${COMPANY_NAME}</div>
      <h1>Project Proposal</h1>
      <div class="subtitle">${safeClientName} / ${safeBusiness} - ${safeNow}</div>

      <div class="row"><div class="label">Client</div><div class="value">${safeClientName}</div></div>
      <div class="row"><div class="label">Business</div><div class="value">${safeBusiness}${safeLocation ? `, ${safeLocation}` : ''}</div></div>
      <div class="row"><div class="label">Proposal Finalized</div><div class="signed">${safeProposalSignedAt}</div></div>

      <div class="section-title">Deliverables</div>
      ${(proposalCards || [])
        .map(
          (card) => `
            <div class="clause">
              <div class="clause-title">${escapeHtml(card.title || '')}</div>
              <div>${(card.items || [])
                .map((item) => `<div style="font-size:13px;color:#444;">- ${escapeHtml(item)}</div>`)
                .join('')}</div>
            </div>
          `
        )
        .join('')}

      <div class="section-title">Investment</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
        ${pricingRowsHtml}
        <tr><td style="padding:8px 0;font-weight:700;"><strong>One-Time Total</strong></td><td style="padding:8px 0;text-align:right;font-weight:700;">${formatMoney(projectTotal || 0)}</td></tr>
      </table>

      <p style="font-size:13px;color:#444;margin:18px 0 4px;"><strong style="color:#2a7a5a;">${guaranteeMonths}-Month Satisfaction Guarantee.</strong> If the client is not fully satisfied with the completed work within ${guaranteeMonths} months of launch, ${COMPANY_NAME} will issue a full refund of all fees paid.</p>

      <div class="section-title">Signature Block</div>
      <div class="sig-block">
        <div class="sig-col">
          <div class="sig-col-label">Client</div>
          ${proposalSigTag}
          <div style="border-bottom:1.5px solid #1a1a1a;margin-bottom:4px;"></div>
          <div class="sig-name">${safeClientName}</div>
          <div class="sig-date">Signed ${safeProposalSignedAt}</div>
        </div>
        <div class="sig-col">
          <div class="sig-col-label">${COMPANY_NAME}</div>
          ${ownerSigTag}
          <div style="border-bottom:1.5px solid #1a1a1a;margin-bottom:4px;"></div>
          <div class="sig-name">${OWNER_NAME} - ${COMPANY_NAME}</div>
          <div class="sig-date">Applied automatically after payment on ${safeProposalSignedAt}</div>
        </div>
      </div>
    </div>

    <div>
      <div class="co-name">${COMPANY_NAME}</div>
      <h1>Service Agreement</h1>
      <div class="subtitle">${safeClientName} / ${safeBusiness} - ${safeNow}</div>

      <div class="row"><div class="label">Agreement Finalized</div><div class="signed">${safeContractSignedAt}</div></div>
      <div class="row"><div class="label">Effective Date</div><div class="value">${safeEffectiveDate}</div></div>
      <div class="row"><div class="label">Selected Plan</div><div class="value">${safePlanShortLabel}</div></div>
      <div class="row"><div class="label">Due Today</div><div class="value">${formatMoney(plan?.dueToday || 0)}</div></div>

      <div class="section-title">Agreement Terms</div>
      ${(contractSections || [])
        .map(
          (section) => `
            <div class="clause">
              <div class="clause-title">${escapeHtml(section.title || '')}</div>
              <p style="font-size:12px;color:#555;line-height:1.75;margin:0;">${escapeHtml(section.content || '')}</p>
            </div>
          `
        )
        .join('')}

      <div class="section-title">Selected Maintenance Plan</div>
      <p style="font-size:13px;color:#444;">${safePlanDetail}</p>
      <p style="font-size:13px;color:#444;">${safePlanCoverage}</p>

      <div class="sig-block">
        <div class="sig-col">
          <div class="sig-col-label">Client</div>
          ${contractSigTag}
          <div style="border-bottom:1.5px solid #1a1a1a;margin-bottom:4px;"></div>
          <div class="sig-name">${safeClientName}</div>
          <div class="sig-date">Signed ${safeContractSignedAt}</div>
        </div>
        <div class="sig-col">
          <div class="sig-col-label">${COMPANY_NAME}</div>
          ${ownerSigTag}
          <div style="border-bottom:1.5px solid #1a1a1a;margin-bottom:4px;"></div>
          <div class="sig-name">${OWNER_NAME} - ${COMPANY_NAME}</div>
          <div class="sig-date">Applied automatically after payment on ${safeContractSignedAt}</div>
        </div>
      </div>
    </div>
  </body>
</html>`
}

function openPrintableDocuments(data) {
  const html = generatePrintableHTML(data)
  const printWindow = window.open('', '_blank')
  if (!printWindow) return false
  printWindow.document.write(html)
  printWindow.document.close()
  return true
}

function SignatureCanvas({ label, onConfirm, locked, initialName = '', initialSignatureImage = '', confirmLabel = 'Confirm Signature' }) {
  const canvasRef = useRef(null)
  const isDrawing = useRef(false)
  const hasSigRef = useRef(Boolean(initialSignatureImage))
  const signatureImageRef = useRef(initialSignatureImage)
  const [hasSig, setHasSig] = useState(Boolean(initialSignatureImage))
  const [typedName, setTypedName] = useState(initialName)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')

    const syncHasSig = (nextHasSig) => {
      hasSigRef.current = nextHasSig
      setHasSig(nextHasSig)
    }

    const drawSignatureImage = (signatureImage) => {
      if (!signatureImage) return
      const image = new Image()
      image.onload = () => {
        const rect = canvas.getBoundingClientRect()
        const canvasWidth = rect.width
        const canvasHeight = rect.height
        const scale = Math.min(canvasWidth / image.width, canvasHeight / image.height, 1)
        const drawWidth = image.width * scale
        const drawHeight = image.height * scale
        const drawX = (canvasWidth - drawWidth) / 2
        const drawY = (canvasHeight - drawHeight) / 2
        ctx.clearRect(0, 0, canvasWidth, canvasHeight)
        ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight)
        syncHasSig(true)
      }
      image.src = signatureImage
    }

    const resize = () => {
      const existingSignatureImage =
        hasSigRef.current && canvas.width > 0 && canvas.height > 0
          ? canvas.toDataURL('image/png')
          : signatureImageRef.current
      signatureImageRef.current = existingSignatureImage || ''

      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      if (signatureImageRef.current) {
        drawSignatureImage(signatureImageRef.current)
      } else {
        syncHasSig(false)
      }
    }

    const getPos = (event) => {
      const rect = canvas.getBoundingClientRect()
      const point = event.touches ? event.touches[0] : event
      return { x: point.clientX - rect.left, y: point.clientY - rect.top }
    }

    const down = (event) => {
      event.preventDefault()
      isDrawing.current = true
      const { x, y } = getPos(event)
      ctx.beginPath()
      ctx.moveTo(x, y)
    }

    const move = (event) => {
      event.preventDefault()
      if (!isDrawing.current) return
      const { x, y } = getPos(event)
      ctx.lineTo(x, y)
      ctx.stroke()
      syncHasSig(true)
    }

    const up = () => {
      if (isDrawing.current && canvas.width > 0 && canvas.height > 0) {
        signatureImageRef.current = canvas.toDataURL('image/png')
      }
      isDrawing.current = false
    }

    resize()
    canvas.addEventListener('mousedown', down)
    canvas.addEventListener('mousemove', move)
    canvas.addEventListener('mouseup', up)
    canvas.addEventListener('mouseleave', up)
    canvas.addEventListener('touchstart', down, { passive: false })
    canvas.addEventListener('touchmove', move, { passive: false })
    canvas.addEventListener('touchend', up)
    window.addEventListener('resize', resize)

    return () => {
      canvas.removeEventListener('mousedown', down)
      canvas.removeEventListener('mousemove', move)
      canvas.removeEventListener('mouseup', up)
      canvas.removeEventListener('mouseleave', up)
      canvas.removeEventListener('touchstart', down)
      canvas.removeEventListener('touchmove', move)
      canvas.removeEventListener('touchend', up)
      window.removeEventListener('resize', resize)
    }
  }, [])

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    signatureImageRef.current = ''
    hasSigRef.current = false
    setHasSig(false)
  }

  const canConfirm = hasSig && typedName.trim().length > 2 && !locked

  return (
    <div className="sig-wrap">
      <span className="sig-label">{label}</span>
      <canvas ref={canvasRef} className={`sig-canvas ${hasSig ? 'has-sig' : ''}`} />
      <div className="sig-actions">
        <div className="sig-hint">Need to redraw it? Clear the signature box and sign again.</div>
        <button className="sig-clear" type="button" onClick={clear} disabled={!hasSig || locked}>
          Clear Signature
        </button>
      </div>
      <input
        className="sig-name-input"
        placeholder="Type your full name to confirm"
        value={typedName}
        onChange={(event) => setTypedName(event.target.value)}
      />
      <button
        className="btn-primary"
        type="button"
        disabled={!canConfirm}
        onClick={() => {
          if (!canConfirm) return
          const signatureImage = canvasRef.current?.toDataURL('image/png') || ''
          onConfirm(typedName.trim(), signatureImage)
        }}
      >
        {confirmLabel}
      </button>
    </div>
  )
}

function Header({ titlePrefix, clientName, businessName }) {
  return (
    <div className="header">
      <div className="logo-wrap">
        <img src="/logo-white.png" alt="Vivid Acuity" className="logo-image" />
      </div>
      <div className="header-divider" />
      <div className="client-tag">
        {titlePrefix} <span>{clientName} / {businessName}</span>
      </div>
    </div>
  )
}

function SavedSignatureNotice() {
  return (
    <div className="sig-wrap">
      <span className="sig-label">Saved Signature</span>
      <div className="plan-summary">
        <div className="plan-summary-label">Auto-Apply Rule</div>
        <div className="plan-summary-value">
          {OWNER_NAME}'s saved {COMPANY_NAME} signature will be stamped onto both
          documents automatically after payment is completed.
        </div>
      </div>
    </div>
  )
}

function DocumentSignaturePreview({ clientName, clientSignatureImage }) {
  const clientPreviewName = clientSignatureImage && clientName ? clientName : ''

  return (
    <div className="sig-wrap">
      <span className="sig-label">Document Signature Preview</span>
      <div className="document-signature-preview">
        <div className="document-signature-col">
          <div className="document-signature-role">Client</div>
          <div className="document-signature-box">
            {clientSignatureImage ? (
              <img
                src={clientSignatureImage}
                alt={`${clientName || 'Client'} signature preview`}
                className="document-signature-image"
              />
            ) : (
              <div className="document-signature-placeholder">Client signature will appear here</div>
            )}
          </div>
          <div className="document-signature-line" />
          <div className="document-signature-name">{clientPreviewName}</div>
        </div>

        <div className="document-signature-col">
          <div className="document-signature-role">{COMPANY_NAME}</div>
          <div className="document-signature-box">
            <img
              src={SAVED_SIGNATURE_SRC}
              alt={`${OWNER_NAME} signature preview`}
              className="document-signature-image"
            />
          </div>
          <div className="document-signature-line" />
          <div className="document-signature-name">{OWNER_NAME} - {COMPANY_NAME}</div>
        </div>
      </div>
    </div>
  )
}

function ProposalStep({
  clientName,
  businessName,
  proposalCards,
  pricingLineItems,
  projectTotal,
  satisfactionGuaranteeMonths,
  onSigned,
  defaultName,
  previewSignatureImage,
}) {
  return (
    <div className="fade-up">
      <Header titlePrefix="Proposal for" clientName={clientName} businessName={businessName} />
      <div className="section-eyebrow">Step 1 of 3</div>
      <div className="section-title">Proposal and Signature</div>
      <p className="section-lead">
        Review the completed proposal below, then sign to move into the service agreement.
        Your Vivid Acuity signature will still be applied automatically after payment.
      </p>

      {(proposalCards || []).map((card) => (
        <div className="card" key={card.title}>
          <span className="card-icon">{card.icon}</span>
          <div className="card-title">{card.title}</div>
          <ul className="card-items">
            {(card.items || []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}

      <div className="card mt-24">
        <div className="card-title">Investment</div>
        <table className="pricing-table">
          <thead>
            <tr><th>Item</th><th>Amount</th></tr>
          </thead>
          <tbody>
            {(pricingLineItems || []).map((item) => (
              <tr key={item.label}>
                <td>{item.label}</td>
                <td>{formatMoney(item.amount)}</td>
              </tr>
            ))}
            <tr><td><strong>One-Time Total</strong></td><td><strong>{formatMoney(projectTotal || 0)}</strong></td></tr>
          </tbody>
        </table>
      </div>

      <div className="card mt-16 guarantee-card">
        <div className="card-title guarantee-title">100% Satisfaction Guarantee</div>
        <p className="guarantee-copy">
          Not happy with the final website and logo within {satisfactionGuaranteeMonths || 3} months of launch? Every dollar
          gets refunded. No questions. No runaround.
        </p>
      </div>

      <SavedSignatureNotice />
      <DocumentSignaturePreview clientName={defaultName} clientSignatureImage={previewSignatureImage} />

      <SignatureCanvas
        label="Proposal - Draw your signature"
        initialName={defaultName}
        initialSignatureImage={previewSignatureImage}
        onConfirm={(name, signatureImage) => onSigned(name, signatureImage)}
      />
    </div>
  )
}

function MaintenancePlanSelector({ planOptions, value, onSelect }) {
  return (
    <div className="plan-list">
      {planOptions.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            className={`plan-option ${selected ? 'selected' : ''}`}
            onClick={() => onSelect(option.value)}
          >
            <div className="plan-option-left">
              <div className="plan-radio">
                <span className={`plan-radio-dot ${selected ? 'visible' : ''}`} />
              </div>
              <div>
                <div className="plan-option-title">
                  {option.label}
                  {option.badge && <span className="plan-badge">{option.badge}</span>}
                </div>
                <div className="plan-option-sub">{option.sub}</div>
              </div>
            </div>
            <div className="plan-option-price">{option.displayPrice}</div>
          </button>
        )
      })}
    </div>
  )
}

function TopBackButton({ onBack }) {
  return (
    <button className="top-back-btn" type="button" onClick={onBack}>
      <span className="top-back-icon" aria-hidden="true">←</span>
      <span>Back</span>
    </button>
  )
}

function AgreementStep({
  clientName,
  businessName,
  contractSections,
  planOptions,
  proposalName,
  previewSignatureImage,
  initialPlan = 'none',
  onContinue,
}) {
  const [plan, setPlan] = useState(initialPlan)
  const planOption = findPlanOption(planOptions, plan)

  return (
    <div className="fade-up">
      <Header titlePrefix="Agreement for" clientName={clientName} businessName={businessName} />
      <div className="accepted-badge"><span>&#10003;</span> Proposal Signed</div>
      <div className="section-eyebrow">Step 2 of 3</div>
      <div className="section-title">Service Agreement and Plan Selection</div>
      <p className="section-lead">
        Review the agreement, choose the maintenance plan, and sign once more to confirm
        the agreement separately from the proposal. The saved Vivid Acuity signature is
        applied after payment completes.
      </p>

      <div className="contract-scroll">
        {(contractSections || []).map((section) => (
          <div className="contract-section" key={section.title}>
            <div className="contract-section-title">{section.title}</div>
            <p>{section.content}</p>
          </div>
        ))}
        <div className="contract-section">
          <div className="contract-section-title">Effective Date</div>
          <p>{new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}</p>
        </div>
      </div>

      <div className="sig-wrap">
        <span className="sig-label">Select Your Maintenance Plan</span>
        <MaintenancePlanSelector planOptions={planOptions} value={plan} onSelect={setPlan} />
        <div className="plan-summary">
          <div className="plan-summary-label">Current Selection</div>
          <div className="plan-summary-value">{planOption.detail}</div>
        </div>
      </div>

      <SavedSignatureNotice />
      <DocumentSignaturePreview clientName={proposalName} clientSignatureImage={previewSignatureImage} />

      <SignatureCanvas
        label="Agreement - Draw a fresh signature"
        initialName={proposalName}
        confirmLabel="Confirm Signature & Continue to Payment"
        onConfirm={(name, signatureImage) => {
          onContinue({ retainer: plan, contractSigImage: signatureImage, contractSignerName: name })
        }}
      />
    </div>
  )
}

function CardOnlyCheckoutForm({ email, onEmailChange, clientId }) {
  const checkoutState = useCheckout()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (checkoutState.type !== 'success') return

    const customerEmail = email.trim()
    if (!customerEmail) {
      setFormError('Customer email is required to complete the Stripe payment.')
      return
    }

    setSubmitting(true)
    setFormError('')

    try {
      const emailResult = await checkoutState.checkout.updateEmail(customerEmail)
      if (emailResult.type === 'error') {
        setFormError(emailResult.error.message || 'Enter a valid customer email.')
        return
      }

      const confirmResult = await checkoutState.checkout.confirm({
        email: customerEmail,
        paymentMethod: 'card',
        redirect: 'if_required',
      })

      if (confirmResult.type === 'error') {
        setFormError(confirmResult.error.message || 'Payment could not be completed.')
        return
      }

      window.location.assign(
        `/?client=${encodeURIComponent(clientId)}&checkout=success&session_id=${encodeURIComponent(confirmResult.session.id)}`
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
      setFormError(message || 'Payment could not be completed.')
    } finally {
      setSubmitting(false)
    }
  }

  if (checkoutState.type === 'loading') {
    return <p className="section-lead" style={{ textAlign: 'center' }}>Preparing secure card form...</p>
  }
  if (checkoutState.type === 'error') {
    return <p className="payment-error">{checkoutState.error.message || 'Unable to load the card form.'}</p>
  }

  const checkoutTotal = checkoutState.checkout.total.total.amount

  return (
    <form className="payment-form-shell" onSubmit={handleSubmit}>
      <div className="stripe-total-row" aria-live="polite">
        <span>Total charged today</span>
        <strong>{checkoutTotal}</strong>
      </div>

      <label className="payment-field">
        <span className="sig-label">Customer Email</span>
        <input
          className="sig-name-input"
          type="text"
          inputMode="email"
          autoComplete="off"
          spellCheck="false"
          placeholder="customer@example.com"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
        />
      </label>

      <div className="embedded-checkout-wrapper payment-element-shell">
        <CheckoutPaymentElement
          options={{
            layout: 'tabs',
            paymentMethodOrder: ['card'],
            wallets: { applePay: 'never', googlePay: 'never', link: 'never' },
            fields: {
              billingDetails: { email: 'never', phone: 'never', address: 'if_required' },
            },
          }}
          onLoadError={(event) => {
            setFormError(event.error.message || 'Unable to load the secure card form.')
          }}
        />
      </div>

      {formError && <p className="payment-error">{formError}</p>}

      <button className="btn-primary payment-submit-btn" type="submit" disabled={submitting}>
        {submitting ? 'Processing Payment...' : 'Pay Now'}
      </button>
    </form>
  )
}

function PaymentStep({
  clientId,
  clientName,
  businessName,
  planOptions,
  pricingLineItems,
  monthlyStartIso,
  defaultCustomerEmail,
  monthlyMaintenanceStart,
  annualMaintenanceEnd,
  signedData,
  proposalSignedAt,
  contractSignedAt,
}) {
  const initialPlan = signedData?.retainer || (planOptions[0] && planOptions[0].value) || 'none'
  const [retainer, setRetainer] = useState(initialPlan)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [customerEmail, setCustomerEmail] = useState(defaultCustomerEmail || '')

  const plan = findPlanOption(planOptions, retainer)
  const effectiveDueToday = plan.dueToday || 0
  const maintenanceLineItem = useMemo(() => buildMaintenanceLineItem(plan), [plan])

  useEffect(() => {
    let active = true

    const initCheckout = async () => {
      setLoading(true)
      setError('')
      setClientSecret('')

      if (!STRIPE_PUBLISHABLE_KEY) {
        setError(
          'Stripe publishable key is missing in this deployment. Add VITE_STRIPE_PUBLISHABLE_KEY in Vercel and redeploy.'
        )
        setLoading(false)
        return
      }

      try {
        const { clientSecret: secret, livemode } = await createCheckoutSession({
          clientId,
          planValue: retainer,
          proposalSignedAt,
          contractSignedAt,
        })

        const publishableKeyMode = getStripeKeyMode(STRIPE_PUBLISHABLE_KEY)
        const serverMode = livemode ? 'live' : 'test'

        if (publishableKeyMode === 'secret_key_error') {
          throw new Error(
            'CRITICAL: A secret key was set in VITE_STRIPE_PUBLISHABLE_KEY. This exposes your Stripe secret to the browser. Fix this immediately in your environment variables.'
          )
        }

        if (publishableKeyMode !== 'unknown' && publishableKeyMode !== serverMode) {
          throw new Error(
            `Stripe key mismatch on this deployment: the browser is using a ${publishableKeyMode} publishable key but the server created a ${serverMode} checkout session.`
          )
        }

        if (active) setClientSecret(secret)
      } catch (err) {
        if (active) setError(err.message || 'Payment setup failed.')
      } finally {
        if (active) setLoading(false)
      }
    }

    initCheckout()
    return () => { active = false }
  }, [retainer, clientId, proposalSignedAt, contractSignedAt])

  return (
    <div className="fade-up">
      <Header titlePrefix="Payment for" clientName={clientName} businessName={businessName} />
      <div className="accepted-badge"><span>&#10003;</span> Proposal Signed <span>&#10003;</span> Agreement Signed</div>
      <div className="section-eyebrow">Step 3 of 3</div>
      <div className="section-title">Payment</div>
      <p className="section-lead">
        Review the selected plan, update it if needed, and complete payment below with a
        card-only form. Link and saved-card autofill are disabled in this step.
      </p>

      <div className="summary-shell">
        <div className="summary-header-row">
          <div>
            <div className="summary-eyebrow">Maintenance Plan</div>
            <div className="summary-title">{plan.shortLabel}</div>
          </div>
          <button type="button" className="summary-edit-btn" onClick={() => setEditing((value) => !value)}>
            {editing ? 'Close' : 'Edit'}
          </button>
        </div>

        {editing && (
          <div className="summary-editor">
            <MaintenancePlanSelector
              planOptions={planOptions}
              value={retainer}
              onSelect={(val) => { setClientSecret(''); setRetainer(val) }}
            />
          </div>
        )}

        <>
          {(pricingLineItems || []).map((item) => (
            <div className="line-item" key={item.label}>
              <div>
                <div className="line-item-title">{item.label}</div>
              </div>
              <div className="line-item-amount">{formatMoney(item.amount)}</div>
            </div>
          ))}

          {retainer === 'annual' && maintenanceLineItem && (
            <div className="line-item">
              <div>
                <div className="line-item-title">{maintenanceLineItem.label}</div>
                {annualMaintenanceEnd && (
                  <div className="line-item-copy">Coverage ends {annualMaintenanceEnd}.</div>
                )}
              </div>
              <div className="line-item-amount">{formatMoney(maintenanceLineItem.amount)}</div>
            </div>
          )}

          {retainer === 'monthly' && maintenanceLineItem && (
            <div className="line-item muted-line">
              <div>
                <div className="line-item-title">{maintenanceLineItem.label}</div>
                {monthlyMaintenanceStart && (
                  <div className="line-item-copy">{formatMoney(maintenanceLineItem.amount)} begins {monthlyMaintenanceStart} and is not charged today.</div>
                )}
              </div>
              <div className="line-item-amount muted-amount">{formatMoney(maintenanceLineItem.amount)}/mo</div>
            </div>
          )}
        </>

        <div className="due-today-card">
          <div className="due-today-label">Due Today</div>
          <div className="due-today-amount">{formatMoney(effectiveDueToday)}</div>
        </div>

        <div className="payment-note">{plan.detail}</div>
        <div className="payment-note">{plan.followUp}</div>
      </div>

      {error && <p className="payment-error">{error}</p>}

      {loading && <p className="section-lead" style={{ textAlign: 'center' }}>Loading checkout...</p>}

      {clientSecret && stripePromise && (
        <CheckoutElementsProvider
          key={clientSecret}
          stripe={stripePromise}
          options={{
            clientSecret,
            defaultValues: { email: defaultCustomerEmail || '' },
            elementsOptions: {
              appearance: {
                theme: 'night',
                inputs: 'spaced',
                labels: 'above',
                variables: {
                  colorPrimary: '#f2f2f2',
                  colorBackground: '#0b0b0b',
                  colorText: '#f5f5f5',
                  colorDanger: '#ff7b7b',
                  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  fontSizeBase: '16px',
                  spacingUnit: '4px',
                  borderRadius: '12px',
                },
                rules: {
                  '.Input': {
                    backgroundColor: '#0b0b0b',
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: 'none',
                    color: '#f5f5f5',
                  },
                  '.Input:focus': {
                    border: '1px solid rgba(255,255,255,0.28)',
                    boxShadow: 'none',
                  },
                  '.Label': {
                    color: '#f5f5f5',
                    fontSize: '14px',
                    fontWeight: '600',
                    marginBottom: '8px',
                  },
                  '.Tab': { display: 'none' },
                  '.Block': {
                    backgroundColor: '#141414',
                    border: '0',
                    boxShadow: 'none',
                  },
                },
              },
              savedPaymentMethod: { enableSave: 'never', enableRedisplay: 'never' },
            },
          }}
        >
          <CardOnlyCheckoutForm
            email={customerEmail}
            onEmailChange={setCustomerEmail}
            clientId={clientId}
          />
        </CheckoutElementsProvider>
      )}

      <div className="stripe-note">
        <span>🔒</span>
        <span>
          Secure Stripe card payment handles the charge.{' '}
          {monthlyMaintenanceStart ? `Monthly maintenance begins on ${monthlyMaintenanceStart}.` : ''}
        </span>
      </div>
    </div>
  )
}

function ThankYouStep({ clientName, plan, onPrint }) {
  const firstName = (clientName || '').split(' ')[0] || 'there'
  return (
    <div className="thankyou">
      <span className="thankyou-icon">🎉</span>
      <div className="thankyou-title">You are all set, {firstName}.</div>
      <p className="thankyou-text">
        Payment received, your saved signature was applied to both documents, and a
        confirmation email was sent to the address on file.
      </p>
      <div className="thankyou-detail">
        <span>&#10003;</span> {plan?.shortLabel || ''} selected
      </div>
      <button type="button" className="btn-secondary thankyou-button" onClick={onPrint}>
        Open Signed Documents
      </button>
    </div>
  )
}

function FullScreenStatus({ title, message, isError }) {
  return (
    <div className="app" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '32px' }}>
      <div>
        <div className="section-eyebrow">Vivid Acuity</div>
        <div className="section-title">{title}</div>
        <p className={isError ? 'payment-error' : 'section-lead'} style={{ maxWidth: 560, margin: '0 auto' }}>{message}</p>
      </div>
    </div>
  )
}

function OnboardingApp({ clientId, clientConfig }) {
  const config = clientConfig.config || {}
  const planOptions = Array.isArray(config.maintenancePlans) && config.maintenancePlans.length
    ? config.maintenancePlans
    : FALLBACK_PLANS
  const proposalCards = Array.isArray(config.proposalCards) ? config.proposalCards : []
  const contractSections = Array.isArray(config.contractSections) ? config.contractSections : []
  const pricingLineItems = Array.isArray(config.pricingLineItems) ? config.pricingLineItems : []
  const projectTotal = typeof config.projectTotal === 'number' ? config.projectTotal : 0
  const satisfactionGuaranteeMonths = typeof config.satisfactionGuaranteeMonths === 'number' ? config.satisfactionGuaranteeMonths : 3
  const monthlyStartIso = typeof config.monthlyStartIso === 'string' ? config.monthlyStartIso : ''
  const monthlyMaintenanceStart = typeof config.monthlyMaintenanceStart === 'string' ? config.monthlyMaintenanceStart : ''
  const annualMaintenanceEnd = typeof config.annualMaintenanceEnd === 'string' ? config.annualMaintenanceEnd : ''

  const storageKeys = useMemo(() => makeStorageKeys(clientId), [clientId])
  const stored = useMemo(() => loadStoredOnboardingState(storageKeys.state), [storageKeys.state])
  const initialName = stored?.proposalName || clientConfig.clientName || ''

  const [step, setStep] = useState(stored?.step || 1)
  const [proposalName, setProposalName] = useState(initialName)
  const [signedData, setSignedData] = useState(stored?.signedData || { retainer: planOptions[0]?.value || 'none' })
  const [proposalSignedAt, setProposalSignedAt] = useState(stored?.proposalSignedAt || '')
  const [contractSignedAt, setContractSignedAt] = useState(stored?.contractSignedAt || '')
  const [proposalSigImage, setProposalSigImage] = useState(stored?.proposalSigImage || '')
  const [contractSigImage, setContractSigImage] = useState(stored?.contractSigImage || '')
  const [emailError, setEmailError] = useState('')
  const [checkoutStatus, setCheckoutStatus] = useState('')
  const ownerSigImage = SAVED_SIGNATURE_SRC

  const timestamp = () => new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const progressIndex = step <= 3 ? step : 3

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [step])

  useEffect(() => {
    persistOnboardingState(storageKeys.state, {
      step,
      proposalName,
      signedData,
      proposalSignedAt,
      contractSignedAt,
      proposalSigImage,
      contractSigImage,
    })
  }, [step, proposalName, signedData, proposalSignedAt, contractSignedAt, proposalSigImage, contractSigImage, storageKeys.state])

  useEffect(() => {
    const currentUrl = new URL(window.location.href)
    const canceled = currentUrl.searchParams.get('canceled')
    const checkoutFlag = currentUrl.searchParams.get('checkout')
    const sessionId = currentUrl.searchParams.get('session_id')

    if (canceled === '1') {
      window.localStorage.removeItem(storageKeys.pendingSession)
      setStep(3)
      setCheckoutStatus('Stripe Checkout was canceled. Your signatures and plan selection are still saved here.')
      clearCheckoutParams()
      return
    }

    if (checkoutFlag === 'success' && sessionId) {
      window.localStorage.setItem(storageKeys.pendingSession, sessionId)
      setStep(3)
      setCheckoutStatus('Verifying your Stripe payment...')
      clearCheckoutParams()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const sessionId = window.localStorage.getItem(storageKeys.pendingSession)
    if (!sessionId) return
    let active = true

    const finalizeCheckout = async () => {
      setStep(3)
      setCheckoutStatus('Verifying your Stripe payment...')
      setEmailError('')

      try {
        const finalizedKey = `${storageKeys.finalizedSessionPrefix}${sessionId}`

        if (window.localStorage.getItem(finalizedKey) === '1') {
          window.localStorage.removeItem(storageKeys.pendingSession)
          setStep(4)
          setCheckoutStatus('')
          return
        }

        const ownerSigDataUrl = await toDataUrl(SAVED_SIGNATURE_SRC)

        const finalization = await postClientStatusUpdate({
          clientId,
          sessionId,
          proposalSignedAt,
          contractSignedAt,
          proposalSigImage,
          contractSigImage,
          ownerSigImage: ownerSigDataUrl,
        })

        if (!active) return

        const planValue = finalization.planValue || signedData.retainer || 'none'
        window.localStorage.setItem(finalizedKey, '1')
        window.localStorage.removeItem(storageKeys.pendingSession)
        setSignedData((current) => ({ ...current, retainer: planValue }))
        setStep(4)
        setCheckoutStatus('')
      } catch (err) {
        if (!active) return
        setCheckoutStatus('')
        setEmailError(err.message || 'Unable to verify Stripe payment.')
      }
    }

    finalizeCheckout()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalName, proposalSignedAt, contractSignedAt, proposalSigImage, contractSigImage, storageKeys.pendingSession, storageKeys.finalizedSessionPrefix])

  const printableData = {
    clientName: proposalName,
    businessName: clientConfig.businessName,
    businessLocation: clientConfig.businessLocation,
    proposalCards,
    contractSections,
    pricingLineItems,
    projectTotal,
    proposalSignedAt,
    contractSignedAt,
    proposalSigImage,
    contractSigImage,
    ownerSigImage,
    plan: findPlanOption(planOptions, signedData.retainer),
    satisfactionGuaranteeMonths,
  }

  const headerClientName = proposalName || clientConfig.clientName || ''

  return (
    <>
      {step < 4 && (
        <div className="progress-wrap">
          <div className="progress-steps">
            {PROGRESS_STEPS.map((item) => {
              const state = progressIndex === item.num ? 'active' : progressIndex > item.num ? 'done' : ''
              return (
                <div className={`step-item ${state}`} key={item.num}>
                  <div className="step-num">{progressIndex > item.num ? '✓' : item.num}</div>
                  <div className="step-label">{item.label}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="app">
        {step > 1 && step < 4 && (
          <TopBackButton onBack={() => setStep((currentStep) => currentStep - 1)} />
        )}

        {step === 1 && (
          <ProposalStep
            clientName={headerClientName || clientConfig.clientName}
            businessName={clientConfig.businessName}
            proposalCards={proposalCards}
            pricingLineItems={pricingLineItems}
            projectTotal={projectTotal}
            satisfactionGuaranteeMonths={satisfactionGuaranteeMonths}
            defaultName={initialName}
            previewSignatureImage={proposalSigImage}
            onSigned={(name, signatureImage) => {
              setProposalName(name)
              setProposalSigImage(signatureImage)
              setProposalSignedAt(timestamp())
              setStep(2)
            }}
          />
        )}

        {step === 2 && (
          <AgreementStep
            clientName={headerClientName || clientConfig.clientName}
            businessName={clientConfig.businessName}
            contractSections={contractSections}
            planOptions={planOptions}
            proposalName={proposalName}
            initialPlan={signedData.retainer}
            previewSignatureImage={proposalSigImage}
            onContinue={(data) => {
              setSignedData({ retainer: data.retainer })
              setContractSigImage(data.contractSigImage)
              setContractSignedAt(timestamp())
              setStep(3)
            }}
          />
        )}

        {step === 3 && (
          <PaymentStep
            clientId={clientId}
            clientName={proposalName}
            businessName={clientConfig.businessName}
            planOptions={planOptions}
            pricingLineItems={pricingLineItems}
            monthlyStartIso={monthlyStartIso}
            monthlyMaintenanceStart={monthlyMaintenanceStart}
            annualMaintenanceEnd={annualMaintenanceEnd}
            defaultCustomerEmail=""
            signedData={signedData}
            proposalSignedAt={proposalSignedAt}
            contractSignedAt={contractSignedAt}
          />
        )}

        {checkoutStatus && step === 3 && <p className="payment-note">{checkoutStatus}</p>}
        {emailError && step === 4 && <p className="payment-error center-error">{emailError}</p>}
        {emailError && step === 3 && <p className="payment-error">{emailError}</p>}

        {step === 4 && (
          <ThankYouStep
            clientName={proposalName}
            plan={findPlanOption(planOptions, signedData.retainer)}
            onPrint={() => openPrintableDocuments(printableData)}
          />
        )}
      </div>
    </>
  )
}

function readAdminKey() {
  if (typeof window === 'undefined') return ''
  try {
    return window.sessionStorage.getItem('vivid-acuity-admin-key') || ''
  } catch {
    return ''
  }
}

async function fetchClientConfig(clientId) {
  const url = `/api/client-config?client=${encodeURIComponent(clientId)}`
  let res = await fetch(url)
  let data = await res.json().catch(() => ({}))

  // Drafts are 423 unless we present an admin key. If the same browser session
  // has the admin key from the /admin dashboard, retry as a preview.
  if (res.status === 423) {
    const adminKey = readAdminKey()
    if (adminKey) {
      res = await fetch(url, { headers: { 'x-admin-key': adminKey } })
      data = await res.json().catch(() => ({}))
    } else {
      const err = new Error(data.error || 'This onboarding link is not yet active.')
      err.notActive = true
      throw err
    }
  }

  if (!res.ok) throw new Error(data.error || `Failed to load client (${res.status}).`)
  return data
}

export default function ClientOnboarding({ clientId }) {
  const [state, setState] = useState({ status: 'loading', config: null, error: '', notActive: false })

  useEffect(() => {
    if (!clientId) {
      setState({ status: 'error', config: null, error: 'No client identifier provided.', notActive: false })
      return undefined
    }

    let active = true
    setState({ status: 'loading', config: null, error: '', notActive: false })

    fetchClientConfig(clientId)
      .then((data) => {
        if (active) setState({ status: 'ready', config: data, error: '', notActive: false })
      })
      .catch((err) => {
        if (!active) return
        setState({
          status: 'error',
          config: null,
          error: err.message || 'Failed to load client.',
          notActive: Boolean(err.notActive),
        })
      })

    return () => { active = false }
  }, [clientId])

  if (state.status === 'loading') {
    return <FullScreenStatus title="Loading your onboarding" message="One moment while we pull your proposal." />
  }
  if (state.status === 'error') {
    if (state.notActive) {
      return (
        <FullScreenStatus
          title="This link isn't active yet"
          message="Your onboarding link will be activated as soon as our final review is complete. You'll receive an email when it's ready."
        />
      )
    }
    return <FullScreenStatus title="We could not load this onboarding link" message={state.error} isError />
  }

  return (
    <>
      {state.config?.isPreview && (
        <div
          style={{
            background: '#eb6611',
            color: '#fff',
            padding: '8px 16px',
            textAlign: 'center',
            fontFamily: 'sans-serif',
            fontSize: 12,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Admin Preview — Draft (not yet visible to client)
        </div>
      )}
      <OnboardingApp clientId={clientId} clientConfig={state.config} />
    </>
  )
}
