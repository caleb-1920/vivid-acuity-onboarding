import { useState, useEffect, useRef } from 'react'
import './ClientOnboarding.css'

// ── Data ──

const PROPOSAL_CARDS = [
  {
    icon: '🎨',
    title: 'Custom Logo Design',
    items: [
      'A brand new logo designed from scratch for Top View Taxidermy',
      'Built to reflect the craft and legacy behind your business',
      'Delivered in every file format you need - web, print, hats, shirts, and more',
    ],
  },
  {
    icon: '💻',
    title: 'Website Design and Development',
    items: [
      'A fully custom website built from the ground up - no templates, no shortcuts',
      'Looks great on phones, tablets, and desktops',
      'Dark, sharp design with a color palette that fits your brand',
      'Fast-loading and professional throughout',
    ],
  },
  {
    icon: '📸',
    title: 'Photo Gallery',
    items: [
      'Photos organized by mount type so visitors find exactly what they are looking for',
      'Click any photo to open it full screen',
      'All photos professionally edited and color-corrected before going live',
    ],
  },
  {
    icon: '🔍',
    title: 'Search Engine Setup',
    items: [
      'Built so Google can find it - people searching for a taxidermist in Kenosha will find you',
      'Displays correctly on every phone with no awkward zooming',
    ],
  },
  {
    icon: '🚀',
    title: 'Live on the Web',
    items: [
      'Loads fast - nobody waits',
      'Hosted on a reliable platform that stays online',
      'Delivered clean with no bugs, ready for real visitors from day one',
    ],
  },
]

const CONTRACT_SECTIONS = [
  { title: '1. Parties', content: 'This Service Agreement is entered into between Caleb Hingos, operating as Vivid Acuity, LLC (caleb@vividacuity.com), Upper Peninsula, Michigan - and Craig Reindl, operating as Top View Taxidermy, Kenosha, Wisconsin. Together referred to as the parties.' },
  { title: '2. Scope of Work', content: 'Vivid Acuity, LLC has completed the following for Top View Taxidermy: (1) A custom logo designed from scratch, delivered in all required file formats. (2) A fully custom website including Home, About, Services, Gallery, Pricing and Policies, FAQ, Testimonials, and Contact sections - responsive across all devices, with a professionally edited photo gallery, search engine setup, and live deployment.' },
  { title: '3. Project Fees', content: 'Setup Fee: $100 - Custom Logo Design: $150 - Website Design and Development: $250 - One-Time Total: $500. Full payment of $500.00 is due upon signing this agreement, processed via Stripe.' },
  { title: '4. Ongoing Maintenance Retainer', content: 'Following the one-time payment, an optional maintenance retainer is available. Monthly Plan: $30/month. Annual Plan: $300/year (saves $60). Covers hosting oversight, uptime monitoring, minor content updates, and dependency maintenance. Either party may cancel with 30 days written notice.' },
  { title: '5. Payment Terms', content: 'Full one-time balance of $500.00 is due upon signing. Retainer (if elected) begins on the first of the month following signing. Payment via Stripe. Balances unpaid after 15 days are subject to 1.5% monthly interest. Intellectual property transfers to the client upon receipt of full payment.' },
  { title: '6. Intellectual Property', content: 'Upon receipt of full payment, all rights to the logo and website - including all design files, code, and content - transfer fully to Craig Reindl / Top View Taxidermy. Vivid Acuity, LLC retains the right to display the work in its portfolio and marketing materials.' },
  { title: '7. Revisions', content: 'Up to 2 rounds of revisions are included. Additional revisions are billed at $75.00/hour. Revision requests must be submitted in writing.' },
  { title: '8. Satisfaction Guarantee', content: 'If the client is not fully satisfied with the completed website and logo within 3 months of launch, Vivid Acuity, LLC will issue a full refund of all fees paid. This guarantee is void if the client has materially altered the delivered work.' },
  { title: '9. Limitation of Liability', content: 'Total liability of Vivid Acuity, LLC is limited to the total fees paid under this agreement. Vivid Acuity, LLC is not liable for any indirect, incidental, or consequential damages.' },
  { title: '10. Termination', content: 'Either party may terminate with 14 days written notice. Upon termination, the client owes fees for all work completed to that date. One-time fees are non-refundable once deliverables are provided. The satisfaction guarantee supersedes this clause where applicable.' },
  { title: '11. Governing Law', content: 'This agreement is governed by the laws of the State of Michigan.' },
]

const PROGRESS_STEPS = [
  { num: 1, label: 'Proposal' },
  { num: 2, label: 'Agreement' },
  { num: 3, label: 'Payment' },
]

// ── Helpers ──

function formatCardNumber(val) {
  return val.replace(/[^0-9]/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
}

function formatExpiry(val) {
  const digits = val.replace(/[^0-9]/g, '').slice(0, 4)
  return digits.length > 2 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits
}

async function sendEmail({ clientName, retainer, proposalSignedAt, contractSignedAt, paymentAmount, proposalSigImage, contractSigImage }) {
  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientName, retainer, proposalSignedAt, contractSignedAt, paymentAmount, proposalSigImage, contractSigImage }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      console.log('Email sent successfully')
    } else {
      console.error('Email error:', data)
    }
  } catch (err) {
    console.error('Email failed:', err)
  }
}

function generatePDFHTML({ clientName, retainer, proposalSignedAt, contractSignedAt, proposalSigImage, contractSigImage }) {
  const retainerLabel = retainer === 'monthly' ? '$30/month' : retainer === 'annual' ? '$300/year' : 'None selected'
  const now = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })

  const proposalSigTag = proposalSigImage
    ? `<img src="${proposalSigImage}" style="max-width:320px;height:80px;display:block;margin:8px 0;object-fit:contain;" />`
    : '<div class="sig-line"></div>'

  const contractSigTag = contractSigImage
    ? `<img src="${contractSigImage}" style="max-width:320px;height:80px;display:block;margin:8px 0;object-fit:contain;" />`
    : '<div class="sig-line"></div>'

  const proposalCardsHtml = PROPOSAL_CARDS.map(card =>
    `<div class="deliverable">
      <div class="deliverable-title">${card.icon} ${card.title}</div>
      <ul class="deliverable-items">${card.items.map(item => `<li>${item}</li>`).join('')}</ul>
    </div>`
  ).join('')

  const contractSectionsHtml = CONTRACT_SECTIONS.map(section =>
    `<div class="clause">
      <div class="clause-title">${section.title}</div>
      <p class="clause-text">${section.content}</p>
    </div>`
  ).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Vivid Acuity - Signed Documents - ${clientName}</title>
<style>
  @page { size: letter; margin: 0.6in 0.75in; }
  body { font-family: Georgia, serif; color: #1a1a1a; background: #fff; padding: 48px; max-width: 800px; margin: 0 auto; line-height: 1.6; }
  .co-name { font-family: sans-serif; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase; color: #eb6611; margin-bottom: 6px; }
  h1 { font-family: sans-serif; font-size: 22px; color: #1a1a1a; margin: 0 0 4px; }
  .subtitle { font-size: 12px; color: #7a7060; margin-bottom: 28px; }
  .section-title { font-family: sans-serif; font-size: 13px; font-weight: 700; color: #A87C4F; text-transform: uppercase; letter-spacing: 0.15em; margin: 24px 0 12px; padding-bottom: 6px; border-bottom: 1px solid rgba(168,124,79,0.25); }
  .row { display: flex; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
  .label { width: 200px; font-size: 13px; color: #7a7060; flex-shrink: 0; }
  .value { font-size: 14px; font-weight: 600; color: #1a1a1a; }
  .signed { font-size: 14px; font-weight: 600; color: #2a7a5a; }
  .price { font-family: sans-serif; font-size: 18px; font-weight: 700; color: #A87C4F; }
  .guarantee { background: #f0faf5; border: 1px solid #c8e6c9; border-radius: 6px; padding: 14px; margin: 14px 0; font-size: 13px; }
  .guarantee strong { color: #2a7a5a; }
  .deliverable { margin-bottom: 16px; }
  .deliverable-title { font-family: sans-serif; font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 6px; }
  .deliverable-items { margin: 0; padding-left: 20px; }
  .deliverable-items li { font-size: 13px; color: #444; line-height: 1.7; margin-bottom: 3px; }
  .pricing-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  .pricing-table td { padding: 8px 0; font-size: 14px; border-bottom: 1px solid #f0f0f0; }
  .pricing-table td:last-child { text-align: right; font-family: sans-serif; font-weight: 500; color: #A87C4F; }
  .pricing-table tr.total td { background: rgba(168,124,79,0.08); font-weight: 700; font-size: 15px; border-bottom: none; }
  .pricing-table tr.total td:last-child { font-size: 18px; font-weight: 700; }
  .clause { margin-bottom: 14px; }
  .clause-title { font-family: sans-serif; font-size: 12px; font-weight: 600; color: #A87C4F; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid rgba(168,124,79,0.15); }
  .clause-text { font-size: 12px; color: #555; line-height: 1.75; margin: 0; }
  .sig-block { display: flex; gap: 48px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; }
  .sig-col { flex: 1; }
  .sig-col-label { font-family: sans-serif; font-size: 11px; color: #A87C4F; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 6px; }
  .sig-line { border-bottom: 1.5px solid #1a1a1a; height: 40px; margin: 8px 0 4px; }
  .sig-name { font-family: sans-serif; font-size: 12px; color: #1a1a1a; font-weight: 600; }
  .sig-date { font-size: 11px; color: #999; margin-top: 2px; }
  .page-break { page-break-after: always; }
  @media print { body { padding: 0; } }
</style>
</head><body>

<!-- ═══════════════════════════════════════════════════ -->
<!-- PAGE 1: FULL SIGNED PROPOSAL                       -->
<!-- ═══════════════════════════════════════════════════ -->

<div class="page-break">
  <div class="co-name">Vivid Acuity, LLC</div>
  <h1>Project Proposal</h1>
  <div class="subtitle">Prepared for ${clientName} / Top View Taxidermy &mdash; ${now}</div>

  <div class="row"><div class="label">Client</div><div class="value">${clientName}</div></div>
  <div class="row"><div class="label">Business</div><div class="value">Top View Taxidermy, Kenosha WI</div></div>
  <div class="row"><div class="label">Proposal Signed</div><div class="signed">&check; ${proposalSignedAt}</div></div>

  <div class="section-title">Deliverables</div>
  ${proposalCardsHtml}

  <div class="section-title">Investment</div>
  <table class="pricing-table">
    <tr><td>Setup Fee</td><td>$100</td></tr>
    <tr><td>Custom Logo Design</td><td>$150</td></tr>
    <tr><td>Website Design and Development</td><td>$250</td></tr>
    <tr class="total"><td><strong>One-Time Total</strong></td><td><strong>$500</strong></td></tr>
  </table>
  <p style="font-size:12px;color:#7a7060;">Optional ongoing maintenance available: $30/month or $300/year. Plan selected in the service agreement.</p>

  <div class="guarantee"><strong>100% Satisfaction Guarantee:</strong> If the client is not fully satisfied with the completed website and logo within 3 months of launch, Vivid Acuity, LLC will issue a full refund of all fees paid. This guarantee is void if the client has materially altered the delivered work.</div>

  <div class="sig-block">
    <div class="sig-col">
      <div class="sig-col-label">Vivid Acuity, LLC</div>
      <div class="sig-line"></div>
      <div class="sig-name">Caleb Hingos &mdash; Vivid Acuity, LLC</div>
      <div class="sig-date">${now}</div>
    </div>
    <div class="sig-col">
      <div class="sig-col-label">Client</div>
      ${proposalSigTag}
      <div class="sig-name">${clientName} &mdash; Top View Taxidermy</div>
      <div class="sig-date">Signed ${proposalSignedAt}</div>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════ -->
<!-- PAGE 2: FULL SIGNED SERVICE AGREEMENT              -->
<!-- ═══════════════════════════════════════════════════ -->

<div>
  <div class="co-name">Vivid Acuity, LLC</div>
  <h1>Service Agreement</h1>
  <div class="subtitle">Top View Taxidermy &mdash; ${clientName} &mdash; ${now}</div>

  <div class="row"><div class="label">Agreement Signed</div><div class="signed">&check; ${contractSignedAt}</div></div>
  <div class="row"><div class="label">Effective Date</div><div class="value">March 31, 2025</div></div>
  <div class="row"><div class="label">Retainer Selected</div><div class="value">${retainerLabel}</div></div>
  <div class="row"><div class="label">Payment</div><div class="price">$500 paid via Stripe</div></div>
  <div class="row"><div class="label">Governing Law</div><div class="value">State of Michigan</div></div>

  <div class="section-title">Agreement Terms</div>
  ${contractSectionsHtml}

  <div class="clause">
    <div class="clause-title">Effective Date</div>
    <p class="clause-text">March 31, 2025</p>
  </div>

  <div class="sig-block">
    <div class="sig-col">
      <div class="sig-col-label">Vivid Acuity, LLC</div>
      <div class="sig-line"></div>
      <div class="sig-name">Caleb Hingos &mdash; Vivid Acuity, LLC</div>
      <div class="sig-date">${now}</div>
    </div>
    <div class="sig-col">
      <div class="sig-col-label">Client</div>
      ${contractSigTag}
      <div class="sig-name">${clientName} &mdash; Top View Taxidermy</div>
      <div class="sig-date">Signed ${contractSignedAt}</div>
    </div>
  </div>
</div>

</body></html>`
}

function printDocument(data) {
  const html = generatePDFHTML(data)
  const win = window.open('', '_blank')
  win.document.write(html)
  win.document.close()
  setTimeout(() => win.print(), 500)
}

// ── SignatureCanvas ──

function SignatureCanvas({ label, onSigned, signed }) {
  const canvasRef = useRef(null)
  const isDrawing = useRef(false)
  const [hasSig, setHasSig] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.scale(dpr, dpr)
      ctx.strokeStyle = '#C9A87A'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }
    resize()

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect()
      const touch = e.touches ? e.touches[0] : e
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
    }

    const down = (e) => {
      e.preventDefault()
      isDrawing.current = true
      const { x, y } = getPos(e)
      ctx.beginPath()
      ctx.moveTo(x, y)
    }

    const move = (e) => {
      e.preventDefault()
      if (!isDrawing.current) return
      const { x, y } = getPos(e)
      ctx.lineTo(x, y)
      ctx.stroke()
      setHasSig(true)
    }

    const up = () => { isDrawing.current = false }

    canvas.addEventListener('mousedown', down)
    canvas.addEventListener('mousemove', move)
    canvas.addEventListener('mouseup', up)
    canvas.addEventListener('touchstart', down, { passive: false })
    canvas.addEventListener('touchmove', move, { passive: false })
    canvas.addEventListener('touchend', up)
    window.addEventListener('resize', resize)

    return () => {
      canvas.removeEventListener('mousedown', down)
      canvas.removeEventListener('mousemove', move)
      canvas.removeEventListener('mouseup', up)
      canvas.removeEventListener('touchstart', down)
      canvas.removeEventListener('touchmove', move)
      canvas.removeEventListener('touchend', up)
      window.removeEventListener('resize', resize)
    }
  }, [])

  const clear = () => {
    const canvas = canvasRef.current
    if (canvas) {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
      setHasSig(false)
    }
  }

  const canConfirm = hasSig && name.trim().length > 2 && !signed

  if (signed) {
    return (
      <div className="sig-wrap" style={{ borderColor: 'rgba(58,182,211,0.4)', background: 'rgba(58,182,211,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: 'var(--cyan)', fontSize: '20px' }}>&#10003;</span>
          <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: '13px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cyan)' }}>
            {label} Signed
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="sig-wrap">
      <span className="sig-label">{label} - Draw Your Signature</span>
      <canvas ref={canvasRef} className={`sig-canvas ${hasSig ? 'has-sig' : ''}`} />
      <button className="sig-clear" onClick={clear}>Clear</button>
      <input
        className="sig-name-input"
        placeholder="Type your full name to confirm"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        className="btn-primary"
        style={{ marginTop: '16px', opacity: canConfirm ? 1 : 0.4, cursor: canConfirm ? 'pointer' : 'not-allowed' }}
        onClick={() => {
          if (!canConfirm) return
          const sigImage = canvasRef.current ? canvasRef.current.toDataURL('image/png') : ''
          onSigned(name, sigImage)
        }}
      >
        Confirm Signature
      </button>
    </div>
  )
}

// ── ProposalStep ──

function ProposalStep({ onAccept }) {
  return (
    <div className="fade-up">
      <div className="header">
        <div className="logo-wrap">
          <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '34px', fontWeight: 700, color: 'var(--cream)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Vivid Acuity</div>
        </div>
        <div className="header-divider" />
        <div className="client-tag">
          Proposal for <span>Craig Reindl / Top View Taxidermy</span>
        </div>
      </div>

      <div className="section-eyebrow">Step 1 of 3</div>
      <div className="section-title">Your Proposal</div>
      <p className="section-lead">
        Here is everything I built for you. Review it below and hit Accept when you are ready to move forward.
      </p>

      {PROPOSAL_CARDS.map((card, i) => (
        <div className="card" key={i}>
          <span className="card-icon">{card.icon}</span>
          <div className="card-title">{card.title}</div>
          <ul className="card-items">
            {card.items.map((item, j) => <li key={j}>{item}</li>)}
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
            <tr><td><strong>One-Time Total</strong></td><td><strong>$500</strong></td></tr>
          </tbody>
        </table>
        <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.7' }}>
          Optional ongoing maintenance available: $30/month or $300/year. You can choose your plan in the next step.
        </p>
      </div>

      <div className="card mt-16" style={{ borderColor: '#3ab6d3', background: '#0d2f38', boxShadow: '0 0 32px rgba(58,182,211,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <span style={{ fontSize: '22px' }}>🛡️</span>
          <div className="card-title" style={{ color: '#ffffff', margin: 0, fontSize: '17px' }}>100% Satisfaction Guarantee</div>
        </div>
        <p style={{ fontSize: '15px', color: '#ffffff', lineHeight: '1.75', fontWeight: '500' }}>
          Not happy with the final website and logo within 3 months of launch? You get every dollar back. No questions. No runaround. Simple as that.
        </p>
      </div>

      <div className="mt-32">
        <button className="btn-primary" onClick={onAccept}>
          Accept Proposal - Continue to Agreement <span>→</span>
        </button>
      </div>
    </div>
  )
}

// ── ProposalSignatureStep ──

function ProposalSignatureStep({ onSigned }) {
  const [signed, setSigned] = useState(false)

  return (
    <div className="fade-up">
      <div className="header" style={{ paddingTop: '32px' }}>
        <div className="logo-wrap">
          <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '34px', fontWeight: 700, color: 'var(--cream)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Vivid Acuity</div>
        </div>
      </div>
      <div className="accepted-badge"><span>&#10003;</span> Proposal Reviewed</div>
      <div className="section-eyebrow">Step 2 of 3 - Proposal Signature</div>
      <div className="section-title">Sign the Proposal</div>
      <p className="section-lead">Sign below to confirm you have reviewed and accepted the proposal details.</p>
      <SignatureCanvas
        label="Proposal"
        onSigned={(name, sigImage) => { setSigned(true); onSigned(name, sigImage) }}
        signed={signed}
      />
    </div>
  )
}

// ── ContractStep ──

function MaintenancePlanSelector({ retainer, onSelect }) {
  const options = [
    { value: 'none', label: 'No Maintenance', sub: 'Not right now', price: null, color: 'var(--tan)' },
    { value: 'monthly', label: 'Monthly', sub: 'First charge May 1, 2026 - cancel anytime', price: '$30', unit: '/mo', color: 'var(--orange)' },
    { value: 'annual', label: 'Annual', sub: 'May 1, 2026 through May 1, 2027', price: '$300', unit: '/yr', color: 'var(--orange)', badge: 'Save $60' },
  ]

  return (
    <div style={{ border: '2px solid rgba(168,124,79,0.35)', borderRadius: '20px', padding: '12px', background: 'var(--bg3)', display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
      {options.map((opt) => {
        const selected = retainer === opt.value
        return (
          <div
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            style={{
              width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              border: `2px solid ${selected ? opt.color : 'rgba(168,124,79,0.2)'}`,
              padding: '14px 16px', borderRadius: '14px', cursor: 'pointer',
              transition: 'border-color 0.3s',
              background: selected ? (opt.value === 'none' ? 'rgba(168,124,79,0.06)' : 'rgba(235,102,17,0.06)') : 'transparent',
            }}
          >
            <div>
              <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '15px', fontWeight: '500', color: 'var(--cream)', marginBottom: '2px' }}>
                {opt.label}
                {opt.badge && (
                  <span style={{ marginLeft: '8px', fontSize: '11px', background: 'rgba(235,102,17,0.15)', color: 'var(--orange)', padding: '2px 8px', borderRadius: '999px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {opt.badge}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{opt.sub}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {opt.price && (
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '20px', fontWeight: '600', color: 'var(--tan-light)' }}>
                  {opt.price}<span style={{ fontSize: '12px' }}>{opt.unit}</span>
                </div>
              )}
              <div style={{
                width: '22px', height: '22px', borderRadius: '50%',
                border: `2px solid ${selected ? opt.color : 'rgba(168,124,79,0.4)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'border-color 0.3s', flexShrink: 0,
              }}>
                <div style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  background: opt.color, opacity: selected ? 1 : 0, transition: 'opacity 0.3s',
                }} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ContractStep({ proposalName, onSign }) {
  const [signed, setSigned] = useState(false)
  const [retainer, setRetainer] = useState('none')

  return (
    <div className="fade-up">
      <div className="header" style={{ paddingTop: '32px' }}>
        <div className="logo-wrap">
          <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '34px', fontWeight: 700, color: 'var(--cream)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Vivid Acuity</div>
        </div>
      </div>
      <div className="accepted-badge"><span>&#10003;</span> Proposal Signed</div>
      <div className="section-eyebrow">Step 2 of 3 - Service Agreement</div>
      <div className="section-title">Service Agreement</div>
      <p className="section-lead">Read through the agreement, select your maintenance plan, then sign to confirm.</p>

      <div className="contract-scroll">
        {CONTRACT_SECTIONS.map((section, i) => (
          <div className="contract-section" key={i}>
            <div className="contract-section-title">{section.title}</div>
            <p>{section.content}</p>
          </div>
        ))}
        <div className="contract-section">
          <div className="contract-section-title">Effective Date</div>
          <p>March 31, 2025</p>
        </div>
      </div>

      <div className="sig-wrap">
        <span className="sig-label">Select Your Maintenance Plan</span>
        <MaintenancePlanSelector retainer={retainer} onSelect={setRetainer} />
      </div>

      <SignatureCanvas
        label="Service Agreement"
        onSigned={(_, sigImage) => { setSigned(true); onSign({ retainer, name: proposalName, contractSigImage: sigImage }) }}
        signed={signed}
      />
    </div>
  )
}

// ── PaymentStep ──

function PaymentStep({ signedData, onPaid }) {
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [zip, setZip] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retainer, setRetainer] = useState(signedData?.retainer || 'none')
  const [totalAmount, setTotalAmount] = useState(signedData?.retainer === 'annual' ? 800 : 500)
  const [editing, setEditing] = useState(false)

  const isAnnual = retainer === 'annual'
  const isMonthly = retainer === 'monthly'
  const displayAmount = isAnnual ? 800 : 500

  const selectPlan = (plan) => {
    setRetainer(plan)
    setTotalAmount(plan === 'annual' ? 800 : 500)
  }

  const handleSubmit = async () => {
    setError('')
    if (!cardNumber.trim() || !expiry.trim() || !cvc.trim() || !zip.trim()) {
      setError('Please fill in all card details.')
      return
    }
    setLoading(true)
    await new Promise((r) => setTimeout(r, 1800))
    setLoading(false)
    onPaid()
  }

  const planLabel = isMonthly ? 'Monthly - $30/mo' : isAnnual ? 'Annual - $300/yr' : 'No Maintenance'

  return (
    <div className="fade-up">
      <div className="header" style={{ paddingTop: '32px' }}>
        <div className="logo-wrap">
          <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '34px', fontWeight: 700, color: 'var(--cream)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Vivid Acuity</div>
        </div>
      </div>
      <div className="accepted-badge"><span>&#10003;</span> Proposal Accepted &middot; <span>&#10003;</span> Agreement Signed</div>
      <div className="section-eyebrow">Step 3 of 3</div>
      <div className="section-title">Payment</div>
      <p className="section-lead">One payment. Everything is yours.</p>

      {/* Order Summary */}
      <div style={{ border: '2px solid var(--border)', borderRadius: '24px', background: 'var(--bg2)', padding: '24px', marginBottom: '24px' }}>
        {/* Maintenance plan selector */}
        <div style={{ marginBottom: '20px' }}>
          {!editing ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>Maintenance Plan</div>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '16px', color: 'var(--cream)' }}>{planLabel}</div>
              </div>
              <button onClick={() => setEditing(true)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--muted)', fontFamily: 'Oswald, sans-serif', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '8px 16px', cursor: 'pointer' }}>
                Edit
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '12px' }}>Select Maintenance Plan</div>
              <MaintenancePlanSelector retainer={retainer} onSelect={selectPlan} />
              <button className="btn-primary" style={{ marginTop: '12px' }} onClick={() => setEditing(false)}>
                Done - Confirm Plan
              </button>
            </div>
          )}
        </div>

        {/* Line items */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid rgba(168,124,79,0.1)' }}>
            <div>
              <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '14px', color: 'var(--cream)' }}>One-Time Project Fee</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>Logo + Website - paid once, yours forever</div>
            </div>
            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '22px', fontWeight: 600, color: 'var(--tan-light)' }}>$500</div>
          </div>

          {isMonthly && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid rgba(168,124,79,0.1)' }}>
              <div>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '14px', color: 'var(--cream)' }}>Monthly Maintenance</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>First charge May 1, 2026 - recurring monthly</div>
              </div>
              <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '22px', fontWeight: 600, color: 'var(--muted)' }}>$30/mo</div>
            </div>
          )}

          {isAnnual && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid rgba(168,124,79,0.1)' }}>
              <div>
                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '14px', color: 'var(--cream)' }}>
                  Annual Maintenance
                  <span style={{ marginLeft: '8px', fontSize: '11px', background: 'rgba(235,102,17,0.15)', color: 'var(--orange)', padding: '2px 8px', borderRadius: '999px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Best Value</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>May 1, 2026 through May 1, 2027</div>
              </div>
              <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '22px', fontWeight: 600, color: 'var(--tan-light)' }}>$300/yr</div>
            </div>
          )}

          {/* Due Today */}
          <div style={{ background: 'rgba(168,124,79,0.08)', borderRadius: '12px', padding: '16px', marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '13px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--tan)' }}>Due Today</div>
            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '28px', fontWeight: 700, color: 'var(--cream)', transition: 'all 0.3s' }}>${totalAmount}</div>
          </div>
        </div>
      </div>

      {/* Card Details */}
      <div className="stripe-placeholder">
        <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '14px', color: 'var(--cream)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>💳</span> Card Details
        </div>
        <input
          className="stripe-field"
          placeholder="Card Number"
          inputMode="numeric"
          value={cardNumber}
          onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
        />
        <div className="stripe-row">
          <input
            className="stripe-field"
            placeholder="MM/YY"
            inputMode="numeric"
            value={expiry}
            onChange={(e) => setExpiry(formatExpiry(e.target.value))}
          />
          <input
            className="stripe-field"
            placeholder="CVC"
            inputMode="numeric"
            value={cvc}
            onChange={(e) => setCvc(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
          />
        </div>
        <input
          className="stripe-field"
          placeholder="ZIP Code"
          inputMode="numeric"
          value={zip}
          onChange={(e) => setZip(e.target.value.slice(0, 10))}
        />
        {error && <p style={{ color: '#ff6b6b', fontSize: '13px', marginTop: '8px' }}>{error}</p>}
      </div>

      <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
        {loading ? 'Processing...' : `Pay $${displayAmount} - Complete Agreement`}
        {!loading && <span>→</span>}
      </button>

      <div className="stripe-note">
        <span>🔒</span>
        <span>Secured by Stripe - Your card info is never stored</span>
      </div>
    </div>
  )
}

// ── ThankYouStep ──

function ThankYouStep({ clientName }) {
  const firstName = clientName ? clientName.split(' ')[0] : ''

  return (
    <div className="thankyou">
      <span className="thankyou-icon">🎉</span>
      <div className="thankyou-title">You are all set{firstName ? `, ${firstName}` : ''}.</div>
      <p className="thankyou-text">
        Payment received. Documents signed. Top View Taxidermy is officially on the internet.
        Caleb will be in touch shortly to confirm everything is live.
      </p>
      <div className="thankyou-detail">
        <span>&#10003;</span> Confirmation sent to caleb@vividacuity.com
      </div>
    </div>
  )
}

// ── Main App ──

export default function ClientOnboarding() {
  const [step, setStep] = useState(1)
  const [signedData, setSignedData] = useState(null)
  const [proposalName, setProposalName] = useState('')
  const [proposalSignedAt, setProposalSignedAt] = useState('')
  const [contractSignedAt, setContractSignedAt] = useState('')
  const [proposalSigImage, setProposalSigImage] = useState('')
  const [contractSigImage, setContractSigImage] = useState('')

  const timestamp = () => new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

  // Progress bar index
  const progressIndex = step <= 1 ? 1 : step <= 3 ? 2 : step === 4 ? 3 : 4

  return (
    <>
      {/* Progress Bar */}
      {step < 5 && (
        <div className="progress-wrap">
          <div className="progress-steps">
            {PROGRESS_STEPS.map((s, i) => {
              const cls = progressIndex === s.num ? 'active' : progressIndex > s.num ? 'done' : ''
              return (
                <div className={`step-item ${cls}`} key={s.num}>
                  <div className="step-num">{progressIndex > s.num ? '✓' : s.num}</div>
                  <div className="step-label">{s.label}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="app">
        {step === 1 && (
          <ProposalStep onAccept={() => setStep(2)} />
        )}

        {step === 2 && (
          <ProposalSignatureStep
            onSigned={(name, sigImage) => {
              setProposalName(name)
              setProposalSignedAt(timestamp())
              setProposalSigImage(sigImage)
              setStep(3)
            }}
          />
        )}

        {step === 3 && (
          <ContractStep
            proposalName={proposalName}
            onSign={(data) => {
              setSignedData(data)
              setContractSignedAt(timestamp())
              setContractSigImage(data.contractSigImage || '')
              setStep(4)
            }}
          />
        )}

        {step === 4 && (
          <PaymentStep
            signedData={signedData}
            onPaid={() => {
              const retainer = signedData?.retainer || 'none'
              const pdfData = {
                clientName: proposalName,
                retainer,
                proposalSignedAt,
                contractSignedAt,
                proposalSigImage,
                contractSigImage,
              }
              sendEmail({
                clientName: proposalName,
                retainer,
                proposalSignedAt,
                contractSignedAt,
                paymentAmount: retainer === 'annual' ? '800.00' : '500.00',
                proposalSigImage,
                contractSigImage,
              })
              printDocument(pdfData)
              setStep(5)
            }}
          />
        )}

        {step === 5 && (
          <ThankYouStep clientName={proposalName} />
        )}
      </div>
    </>
  )
}
