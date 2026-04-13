import { useEffect, useRef, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  CheckoutElementsProvider,
  PaymentElement as CheckoutPaymentElement,
  useCheckout,
} from '@stripe/react-stripe-js/checkout'
import './ClientOnboarding.css'

const STRIPE_PUBLISHABLE_KEY = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '').trim()
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null

const CLIENT_NAME = 'Craig Reindl'
const BUSINESS_NAME = 'Top View Taxidermy'
const OWNER_NAME = 'Caleb Hingos'
const COMPANY_NAME = 'Vivid Acuity, LLC'
const SAVED_SIGNATURE_SRC = '/signature.png?v=1'
const DEFAULT_CUSTOMER_EMAIL = 'pineapple.906.pistachio@gmail.com'
const STORAGE_KEY = 'vivid-acuity-onboarding-state'
const FINALIZED_SESSION_PREFIX = 'vivid-acuity-finalized-session:'
const PENDING_SESSION_KEY = 'vivid-acuity-pending-session'

const PROPOSAL_CARDS = [
  {
    icon: '🎨',
    title: 'Custom Logo Design',
    items: [
      'A brand new logo designed from scratch for Top View Taxidermy.',
      'Built to reflect the craft and legacy behind the business.',
      'Delivered in every file format needed for web, print, hats, shirts, and more.',
    ],
  },
  {
    icon: '💻',
    title: 'Website Design and Development',
    items: [
      'A fully custom website built from the ground up with no templates.',
      'Responsive across phones, tablets, and desktops.',
      'Dark, sharp design with a color palette that fits the brand.',
      'Fast-loading and professional throughout.',
    ],
  },
  {
    icon: '📸',
    title: 'Photo Gallery',
    items: [
      'Photos organized by mount type so visitors can find what they want quickly.',
      'Click any photo to open it full screen.',
      'All photos professionally edited and color-corrected before going live.',
    ],
  },
  {
    icon: '🔍',
    title: 'Search Engine Setup',
    items: [
      'Built so Google can find it when people search for a taxidermist in Kenosha.',
      'Displays correctly on every phone with no awkward zooming.',
    ],
  },
  {
    icon: '🚀',
    title: 'Live on the Web',
    items: [
      'Loads fast so nobody waits.',
      'Hosted on a reliable platform that stays online.',
      'Delivered clean with no bugs and ready for real visitors from day one.',
    ],
  },
]

const CONTRACT_SECTIONS = [
  {
    title: '1. Parties',
    content:
      'This Service Agreement is entered into between Caleb Hingos, operating as Vivid Acuity, LLC (caleb@vividacuity.com), Upper Peninsula, Michigan, and Craig Reindl, operating as Top View Taxidermy, Kenosha, Wisconsin.',
  },
  {
    title: '2. Scope of Work',
    content:
      'Vivid Acuity, LLC has completed a custom logo and a fully custom website including responsive design, edited gallery assets, search engine setup, and live deployment.',
  },
  {
    title: '3. Project Fees',
    content:
      'Setup Fee: $100. Custom Logo Design: $150. Website Design and Development: $250. Domain Cost: $12. One-time project total: $512, due upon signing this agreement.',
  },
  {
    title: '4. Ongoing Maintenance',
    content:
      'Optional maintenance may be selected as either $30/month or $300/year. Coverage includes hosting oversight, uptime monitoring, minor content updates, and dependency maintenance.',
  },
  {
    title: '5. Payment Terms',
    content:
      'Full one-time balance is due upon signing. Monthly maintenance begins May 1, 2026 if selected. Annual maintenance covers May 1, 2026 through May 1, 2027 if selected.',
  },
  {
    title: '6. Intellectual Property',
    content:
      'Upon receipt of full payment, all rights to the logo and website transfer fully to Craig Reindl / Top View Taxidermy. Vivid Acuity may still display the work in its portfolio.',
  },
  {
    title: '7. Revisions',
    content:
      'Up to two rounds of revisions are included. Additional revisions are billed at $75/hour and must be requested in writing.',
  },
  {
    title: '8. Satisfaction Guarantee',
    content:
      'If the client is not fully satisfied with the completed website and logo within 3 months of launch, Vivid Acuity, LLC will issue a full refund of all fees paid.',
  },
  {
    title: '9. Limitation of Liability',
    content:
      'Total liability of Vivid Acuity, LLC is limited to the total fees paid under this agreement.',
  },
  {
    title: '10. Governing Law',
    content: 'This agreement is governed by the laws of the State of Michigan.',
  },
]

const PLAN_OPTIONS = [
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
  },
  {
    value: 'monthly',
    label: 'Monthly',
    sub: 'First charge May 1, 2026',
    shortLabel: 'Monthly - $30/mo',
    displayPrice: '$30/mo',
    dueToday: 512,
    detail: '$512 due today, including the domain cost. Monthly maintenance of $30 begins May 1, 2026.',
    followUp: '$30/month starts May 1, 2026.',
    coverage: 'Month-to-month maintenance begins May 1, 2026.',
  },
  {
    value: 'annual',
    label: 'Annual',
    sub: 'Coverage through May 1, 2027',
    shortLabel: 'Annual - $300/yr',
    displayPrice: '$300/yr',
    dueToday: 812,
    detail: '$812 due today: $512 project fee, including the domain cost, plus $300 annual maintenance.',
    followUp: 'Annual maintenance covers May 1, 2026 through May 1, 2027.',
    coverage: 'Coverage runs from May 1, 2026 through May 1, 2027.',
    badge: 'Save $60',
  },
]

const PROGRESS_STEPS = [
  { num: 1, label: 'Proposal' },
  { num: 2, label: 'Agreement' },
  { num: 3, label: 'Payment' },
]

function getPlan(value) {
  return PLAN_OPTIONS.find((option) => option.value === value) || PLAN_OPTIONS[0]
}

function formatMoney(amount) {
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

function loadStoredOnboardingState() {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function persistOnboardingState(state) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
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

async function sendEmail(payload) {
  const res = await fetch('/api/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || 'Failed to send email.')
  }

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
  if (!res.ok) {
    throw new Error(data.error || 'Failed to create Stripe checkout session.')
  }

  if (typeof data.clientSecret !== 'string' || !data.clientSecret.trim()) {
    throw new Error(
      'Stripe did not return a client secret. On Vercel, verify /api/create-checkout-session is deployed and STRIPE_SECRET_KEY is set.'
    )
  }

  return data
}

async function fetchCheckoutSession(sessionId) {
  const res = await fetch(`/api/checkout-session?session_id=${encodeURIComponent(sessionId)}`)
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.error || 'Failed to verify Stripe checkout session.')
  }

  return data
}

function generatePrintableHTML({
  clientName,
  proposalSignedAt,
  contractSignedAt,
  proposalSigImage,
  contractSigImage,
  ownerSigImage,
  plan,
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
  const safeProposalSignedAt = escapeHtml(proposalSignedAt)
  const safeContractSignedAt = escapeHtml(contractSignedAt)
  const safeNow = escapeHtml(now)
  const safeEffectiveDate = escapeHtml(effectiveDate)
  const safePlanShortLabel = escapeHtml(plan.shortLabel)
  const safePlanDetail = escapeHtml(plan.detail)
  const safePlanCoverage = escapeHtml(plan.coverage)
  const proposalSigTag = buildPrintableSignatureTag(proposalSigImage)
  const contractSigTag = buildPrintableSignatureTag(contractSigImage)
  const ownerSigTag = buildPrintableSignatureTag(ownerSigImage)

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
      <div class="subtitle">${safeClientName} / ${BUSINESS_NAME} - ${safeNow}</div>

      <div class="row"><div class="label">Client</div><div class="value">${safeClientName}</div></div>
      <div class="row"><div class="label">Business</div><div class="value">${BUSINESS_NAME}</div></div>
      <div class="row"><div class="label">Proposal Finalized</div><div class="signed">${safeProposalSignedAt}</div></div>

      <div class="section-title">Deliverables</div>
      ${PROPOSAL_CARDS.map(
        (card) => `
          <div class="clause">
            <div class="clause-title">${escapeHtml(card.title)}</div>
            <div>${card.items
              .map((item) => `<div style="font-size:13px;color:#444;">- ${escapeHtml(item)}</div>`)
              .join('')}</div>
          </div>
        `
      ).join('')}

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
      <div class="subtitle">${safeClientName} / ${BUSINESS_NAME} - ${safeNow}</div>

      <div class="row"><div class="label">Agreement Finalized</div><div class="signed">${safeContractSignedAt}</div></div>
      <div class="row"><div class="label">Effective Date</div><div class="value">${safeEffectiveDate}</div></div>
      <div class="row"><div class="label">Selected Plan</div><div class="value">${safePlanShortLabel}</div></div>
      <div class="row"><div class="label">Due Today</div><div class="value">${formatMoney(plan.dueToday)}</div></div>

      <div class="section-title">Agreement Terms</div>
      ${CONTRACT_SECTIONS.map(
        (section) => `
          <div class="clause">
            <div class="clause-title">${escapeHtml(section.title)}</div>
            <p style="font-size:12px;color:#555;line-height:1.75;margin:0;">${escapeHtml(section.content)}</p>
          </div>
        `
      ).join('')}

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

function SignatureCanvas({ label, onConfirm, locked, initialName = '', initialSignatureImage = '' }) {
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
        Confirm Signature
      </button>
    </div>
  )
}

function Header({ titlePrefix }) {
  return (
    <div className="header">
      <div className="logo-wrap">
        <img src="/logo-white.png" alt="Vivid Acuity" className="logo-image" />
      </div>
      <div className="header-divider" />
      <div className="client-tag">
        {titlePrefix} <span>{CLIENT_NAME} / {BUSINESS_NAME}</span>
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

function ProposalStep({ onSigned, defaultName, previewSignatureImage }) {
  return (
    <div className="fade-up">
      <Header titlePrefix="Proposal for" />
      <div className="section-eyebrow">Step 1 of 3</div>
      <div className="section-title">Proposal and Signature</div>
      <p className="section-lead">
        Review the completed proposal below, then sign to move into the service agreement.
        Your Vivid Acuity signature will still be applied automatically after payment.
      </p>

      {PROPOSAL_CARDS.map((card) => (
        <div className="card" key={card.title}>
          <span className="card-icon">{card.icon}</span>
          <div className="card-title">{card.title}</div>
          <ul className="card-items">
            {card.items.map((item) => (
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
            <tr><td>Setup Fee</td><td>$100</td></tr>
            <tr><td>Custom Logo Design</td><td>$150</td></tr>
            <tr><td>Website Design and Development</td><td>$250</td></tr>
            <tr><td>Domain Cost</td><td>$12</td></tr>
            <tr><td><strong>One-Time Total</strong></td><td><strong>$512</strong></td></tr>
          </tbody>
        </table>
      </div>

      <div className="card mt-16 guarantee-card">
        <div className="card-title guarantee-title">100% Satisfaction Guarantee</div>
        <p className="guarantee-copy">
          Not happy with the final website and logo within 3 months of launch? Every dollar
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

function MaintenancePlanSelector({ value, onSelect }) {
  return (
    <div className="plan-list">
      {PLAN_OPTIONS.map((option) => {
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

function StepActions({ primaryLabel, onPrimary, primaryDisabled = false, primaryClassName = 'btn-primary' }) {
  return (
    <div className="step-actions">
      <button className={primaryClassName} type="button" onClick={onPrimary} disabled={primaryDisabled}>
        {primaryLabel}
      </button>
    </div>
  )
}

function AgreementStep({ proposalName, onContinue, previewSignatureImage, initialPlan = 'none' }) {
  const [plan, setPlan] = useState(initialPlan)

  return (
    <div className="fade-up">
      <Header titlePrefix="Agreement for" />
      <div className="accepted-badge"><span>&#10003;</span> Proposal Signed</div>
      <div className="section-eyebrow">Step 2 of 3</div>
      <div className="section-title">Service Agreement and Plan Selection</div>
      <p className="section-lead">
        Review the agreement and choose the maintenance plan. Your proposal signature
        carries forward automatically here, and the saved Vivid Acuity signature is
        applied after payment completes.
      </p>

      <div className="contract-scroll">
        {CONTRACT_SECTIONS.map((section) => (
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
        <MaintenancePlanSelector value={plan} onSelect={setPlan} />
        <div className="plan-summary">
          <div className="plan-summary-label">Current Selection</div>
          <div className="plan-summary-value">{getPlan(plan).detail}</div>
        </div>
      </div>

      <SavedSignatureNotice />
      <DocumentSignaturePreview clientName={proposalName} clientSignatureImage={previewSignatureImage} />

      <StepActions onPrimary={() => onContinue({ retainer: plan })} primaryLabel="Continue to Payment" />
    </div>
  )
}

function CardOnlyCheckoutForm({ email, onEmailChange, amount }) {
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

      window.location.assign(`/?checkout=success&session_id=${encodeURIComponent(confirmResult.session.id)}`)
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

  return (
    <form className="payment-form-shell" onSubmit={handleSubmit}>
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
            wallets: {
              applePay: 'never',
              googlePay: 'never',
              link: 'never',
            },
            fields: {
              billingDetails: {
                email: 'never',
                phone: 'never',
                address: 'if_required',
              },
            },
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

function PaymentStep({ proposalName, signedData, proposalSignedAt, contractSignedAt }) {
  const initialPlan = signedData?.retainer || 'none'
  const [retainer, setRetainer] = useState(initialPlan)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [customerEmail, setCustomerEmail] = useState(DEFAULT_CUSTOMER_EMAIL)
  const [customAmount, setCustomAmount] = useState(null)
  const [customInput, setCustomInput] = useState('')

  const plan = getPlan(retainer)
  const effectiveDueToday = customAmount !== null ? customAmount : plan.dueToday

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
          clientName: proposalName,
          retainer,
          customAmount,
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
  }, [retainer, customAmount, proposalName, proposalSignedAt, contractSignedAt])

  return (
    <div className="fade-up">
      <Header titlePrefix="Payment for" />
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
            <MaintenancePlanSelector value={retainer} onSelect={(val) => { setClientSecret(''); setRetainer(val); setCustomAmount(null); setCustomInput('') }} />
            <div className="custom-price-field">
              <label className="custom-price-label">Or set a custom total due today ($)</label>
              <div className="custom-price-input-wrap">
                <span className="custom-price-dollar">$</span>
                <input
                  type="number"
                  className="custom-price-input"
                  min="1"
                  step="1"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder={String(effectiveDueToday)}
                />
              </div>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                const parsed = parseInt(customInput, 10)
                if (!isNaN(parsed) && parsed > 0) {
                  setClientSecret('')
                  setCustomAmount(parsed)
                }
                setEditing(false)
              }}
            >
              Done - Confirm Price
            </button>
          </div>
        )}

        {customAmount === null && (
          <>
            <div className="line-item">
              <div>
                <div className="line-item-title">One-Time Project Fee</div>
                <div className="line-item-copy">Logo + website build, paid once.</div>
              </div>
              <div className="line-item-amount">$500</div>
            </div>

            <div className="line-item">
              <div>
                <div className="line-item-title">Domain Cost</div>
                <div className="line-item-copy">Annual domain registration paid today.</div>
              </div>
              <div className="line-item-amount">$12</div>
            </div>

            {retainer === 'annual' && (
              <div className="line-item">
                <div>
                  <div className="line-item-title">Annual Maintenance</div>
                  <div className="line-item-copy">Coverage from May 1, 2026 through May 1, 2027.</div>
                </div>
                <div className="line-item-amount">$300</div>
              </div>
            )}

            {retainer === 'monthly' && (
              <div className="line-item muted-line">
                <div>
                  <div className="line-item-title">Monthly Maintenance</div>
                  <div className="line-item-copy">$30 begins May 1, 2026 and is not charged today.</div>
                </div>
                <div className="line-item-amount muted-amount">$30/mo</div>
              </div>
            )}
          </>
        )}

        <div className="due-today-card">
          <div className="due-today-label">Due Today</div>
          <div className="due-today-amount">{formatMoney(effectiveDueToday)}</div>
        </div>

        {customAmount === null && (
          <>
            <div className="payment-note">{plan.detail}</div>
            <div className="payment-note">{plan.followUp}</div>
          </>
        )}
      </div>

      {error && <p className="payment-error">{error}</p>}

      {loading && <p className="section-lead" style={{ textAlign: 'center' }}>Loading checkout...</p>}

      {clientSecret && stripePromise && (
        <CheckoutElementsProvider
          key={clientSecret}
          stripe={stripePromise}
          options={{
            clientSecret,
            defaultValues: {
              email: DEFAULT_CUSTOMER_EMAIL,
            },
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
                  '.Tab': {
                    display: 'none',
                  },
                  '.Block': {
                    backgroundColor: '#141414',
                    border: '0',
                    boxShadow: 'none',
                  },
                },
              },
              savedPaymentMethod: {
                enableSave: 'never',
                enableRedisplay: 'never',
              },
            },
          }}
        >
          <CardOnlyCheckoutForm
            email={customerEmail}
            onEmailChange={setCustomerEmail}
            amount={effectiveDueToday}
          />
        </CheckoutElementsProvider>
      )}

      <div className="stripe-note">
        <span>🔒</span>
        <span>
          Secure Stripe card payment handles the charge. Monthly maintenance begins on May 1, 2026.
        </span>
      </div>
    </div>
  )
}

function ThankYouStep({ clientName, plan, onPrint }) {
  const firstName = clientName.split(' ')[0]

  return (
    <div className="thankyou">
      <span className="thankyou-icon">🎉</span>
      <div className="thankyou-title">You are all set, {firstName}.</div>
      <p className="thankyou-text">
        Payment received, your saved signature was applied to both documents, and a
        confirmation email was sent to
        <code className="thankyou-email">caleb@vividacuity.com</code>.
      </p>
      <div className="thankyou-detail">
        <span>&#10003;</span> {plan.shortLabel} selected
      </div>
      <button type="button" className="btn-secondary thankyou-button" onClick={onPrint}>
        Open Signed Documents
      </button>
    </div>
  )
}

export default function ClientOnboarding() {
  const storedState = loadStoredOnboardingState()
  const [step, setStep] = useState(storedState?.step || 1)
  const [proposalName, setProposalName] = useState(storedState?.proposalName || '')
  const [signedData, setSignedData] = useState(storedState?.signedData || { retainer: 'none' })
  const [proposalSignedAt, setProposalSignedAt] = useState(storedState?.proposalSignedAt || '')
  const [contractSignedAt, setContractSignedAt] = useState(storedState?.contractSignedAt || '')
  const [proposalSigImage, setProposalSigImage] = useState(storedState?.proposalSigImage || '')
  const [contractSigImage, setContractSigImage] = useState(storedState?.contractSigImage || '')
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
    persistOnboardingState({
      step,
      proposalName,
      signedData,
      proposalSignedAt,
      contractSignedAt,
      proposalSigImage,
      contractSigImage,
    })
  }, [step, proposalName, signedData, proposalSignedAt, contractSignedAt, proposalSigImage, contractSigImage])

  useEffect(() => {
    const currentUrl = new URL(window.location.href)
    const canceled = currentUrl.searchParams.get('canceled')
    const checkoutFlag = currentUrl.searchParams.get('checkout')
    const sessionId = currentUrl.searchParams.get('session_id')

    if (canceled === '1') {
      window.localStorage.removeItem(PENDING_SESSION_KEY)
      setStep(3)
      setCheckoutStatus('Stripe Checkout was canceled. Your signatures and plan selection are still saved here.')
      clearCheckoutParams()
      return
    }

    if (checkoutFlag === 'success' && sessionId) {
      window.localStorage.setItem(PENDING_SESSION_KEY, sessionId)
      setStep(3)
      setCheckoutStatus('Verifying your Stripe payment...')
      clearCheckoutParams()
    }
  }, [])

  useEffect(() => {
    const sessionId = window.localStorage.getItem(PENDING_SESSION_KEY)
    if (!sessionId) return

    let active = true

    const finalizeCheckout = async () => {
      setStep(3)
      setCheckoutStatus('Verifying your Stripe payment...')
      setEmailError('')

      try {
        const session = await fetchCheckoutSession(sessionId)

        if (!active) return

        if (window.localStorage.getItem(`${FINALIZED_SESSION_PREFIX}${sessionId}`) === '1') {
          window.localStorage.removeItem(PENDING_SESSION_KEY)
          setSignedData((current) => ({ ...current, retainer: session.retainer }))
          setStep(4)
          setCheckoutStatus('')
          return
        }

        const ownerSigDataUrl = await toDataUrl(SAVED_SIGNATURE_SRC)

        await sendEmail({
          clientName: proposalName,
          retainer: session.retainer,
          proposalSignedAt,
          contractSignedAt,
          paymentAmount: session.amountTotal,
          proposalSigImage,
          contractSigImage,
          ownerSigImage: ownerSigDataUrl,
          planLabel: session.plan.shortLabel,
          planDetail: session.plan.detail,
          planCoverageLine: session.plan.coverage,
        })

        if (!active) return

        window.localStorage.setItem(`${FINALIZED_SESSION_PREFIX}${sessionId}`, '1')
        window.localStorage.removeItem(PENDING_SESSION_KEY)
        setSignedData((current) => ({ ...current, retainer: session.retainer }))
        setStep(4)
        setCheckoutStatus('')
      } catch (err) {
        if (!active) return
        setCheckoutStatus('')
        setEmailError(err.message || 'Unable to verify Stripe payment.')
      }
    }

    finalizeCheckout()

    return () => {
      active = false
    }
  }, [proposalName, proposalSignedAt, contractSignedAt, proposalSigImage, contractSigImage])

  const printableData = {
    clientName: proposalName,
    proposalSignedAt,
    contractSignedAt,
    proposalSigImage,
    contractSigImage,
    ownerSigImage,
    plan: getPlan(signedData.retainer),
  }

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
            defaultName={proposalName}
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
            proposalName={proposalName}
            initialPlan={signedData.retainer}
            previewSignatureImage={proposalSigImage}
            onContinue={(data) => {
              setSignedData(data)
              setContractSigImage(proposalSigImage)
              setContractSignedAt(timestamp())
              setStep(3)
            }}
          />
        )}

        {step === 3 && (
          <PaymentStep
            proposalName={proposalName}
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
            plan={getPlan(signedData.retainer)}
            onPrint={() => openPrintableDocuments(printableData)}
          />
        )}
      </div>
    </>
  )
}
