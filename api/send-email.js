// Vercel Serverless Function

const VALID_RETAINERS = new Set(['none', 'monthly', 'annual'])

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[char]
  })
}

function isValidDataUrl(str) {
  return typeof str === 'string' && str.startsWith('data:image/png;base64,') && str.length < 500000
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    clientName,
    retainer,
    proposalSignedAt,
    contractSignedAt,
    paymentAmount,
    proposalSigImage,
    contractSigImage,
  } = req.body;

  const resendApiKey = process.env.RESEND_API_KEY;
  const normalizedClientName = typeof clientName === 'string' ? clientName.trim() : '';
  const normalizedProposalSignedAt = typeof proposalSignedAt === 'string' ? proposalSignedAt.trim() : '';
  const normalizedContractSignedAt = typeof contractSignedAt === 'string' ? contractSignedAt.trim() : '';
  const numericPaymentAmount = Number(paymentAmount);

  if (!resendApiKey) {
    return res.status(500).json({ error: 'Server email configuration is missing.' });
  }

  if (!normalizedClientName) {
    return res.status(400).json({ error: 'Client name is required.' });
  }

  if (!VALID_RETAINERS.has(retainer)) {
    return res.status(400).json({ error: 'A valid retainer plan is required.' });
  }

  if (!normalizedProposalSignedAt || !normalizedContractSignedAt) {
    return res.status(400).json({ error: 'Proposal and agreement signatures are required.' });
  }

  if (!Number.isFinite(numericPaymentAmount) || numericPaymentAmount <= 0) {
    return res.status(400).json({ error: 'Payment amount must be greater than 0.' });
  }

  const retainerLabel = retainer === 'monthly' ? '$30/month' : retainer === 'annual' ? '$300/year' : 'None selected';
  const now = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
  const effectiveDate = new Date().toLocaleDateString('en-US', { dateStyle: 'long' });
  const formattedPaymentAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(numericPaymentAmount);

  const safe = escapeHtml;
  const safeClientName = safe(normalizedClientName);
  const safeProposalSignedAt = safe(normalizedProposalSignedAt);
  const safeContractSignedAt = safe(normalizedContractSignedAt);

  const proposalSigHtml = isValidDataUrl(proposalSigImage)
    ? `<img src="${proposalSigImage}" style="max-width:300px;height:60px;display:block;margin:8px 0;" alt="Proposal Signature" />`
    : '<div style="height:40px;border-bottom:1.5px solid #1a1a1a;margin:8px 0;"></div>';

  const contractSigHtml = isValidDataUrl(contractSigImage)
    ? `<img src="${contractSigImage}" style="max-width:300px;height:60px;display:block;margin:8px 0;" alt="Contract Signature" />`
    : '<div style="height:40px;border-bottom:1.5px solid #1a1a1a;margin:8px 0;"></div>';

  const s = {
    body: 'font-family:Georgia,serif;max-width:700px;margin:0 auto;background:#ffffff;color:#1a1a1a;padding:48px;',
    coName: 'font-family:sans-serif;font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#eb6611;margin-bottom:8px;',
    h1: 'font-family:sans-serif;font-size:24px;color:#1a1a1a;margin:0 0 4px;',
    subtitle: 'font-size:13px;color:#7a7060;margin-bottom:32px;',
    sectionTitle: 'font-family:sans-serif;font-size:13px;font-weight:700;color:#A87C4F;text-transform:uppercase;letter-spacing:0.15em;margin:32px 0 12px;padding-bottom:6px;border-bottom:1px solid rgba(168,124,79,0.25);',
    row: 'display:flex;padding:8px 0;border-bottom:1px solid #f0f0f0;',
    label: 'width:200px;font-size:13px;color:#7a7060;flex-shrink:0;',
    value: 'font-size:14px;font-weight:600;color:#1a1a1a;',
    signed: 'font-size:14px;font-weight:600;color:#2a7a5a;',
    price: 'font-family:sans-serif;font-size:18px;font-weight:700;color:#A87C4F;',
    cardTitle: 'font-family:sans-serif;font-size:16px;font-weight:600;color:#1a1a1a;margin:20px 0 10px;',
    cardItem: 'font-size:13px;color:#444;line-height:1.7;padding:4px 0 4px 16px;position:relative;',
    dot: 'display:inline-block;width:6px;height:6px;border-radius:50%;background:#A87C4F;margin-right:8px;vertical-align:middle;',
    guarantee: 'background:#f0faf5;border:1px solid #c8e6c9;border-radius:6px;padding:16px;margin:16px 0;',
    contractSection: 'margin-bottom:16px;',
    contractTitle: 'font-family:sans-serif;font-size:12px;font-weight:600;color:#A87C4F;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid rgba(168,124,79,0.15);',
    contractText: 'font-size:12px;color:#666;line-height:1.75;margin:0;',
    sigBlock: 'margin-top:32px;padding-top:20px;border-top:1px solid #eee;',
    sigLabel: 'font-family:sans-serif;font-size:11px;color:#A87C4F;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:4px;',
    sigName: 'font-family:sans-serif;font-size:12px;color:#1a1a1a;font-weight:600;',
    sigDate: 'font-size:11px;color:#999;margin-top:2px;',
  }

  const html = `
<div style="${s.body}">
  <div style="${s.coName}">Vivid Acuity, LLC</div>
  <h1 style="${s.h1}">Signed Client Documents</h1>
  <div style="${s.subtitle}">Top View Taxidermy &middot; ${safeClientName} &middot; ${now}</div>

  <!-- ═══════════════ PROPOSAL ═══════════════ -->
  <div style="${s.sectionTitle}">Proposal - Accepted and Signed</div>

  <div style="${s.row}"><div style="${s.label}">Client</div><div style="${s.value}">${safeClientName}</div></div>
  <div style="${s.row}"><div style="${s.label}">Business</div><div style="${s.value}">Top View Taxidermy, Kenosha WI</div></div>
  <div style="${s.row}"><div style="${s.label}">Proposal Signed</div><div style="${s.signed}">&#10003; ${safeProposalSignedAt}</div></div>

  <div style="${s.cardTitle}">&#127912; Custom Logo Design</div>
  <div style="${s.cardItem}"><span style="${s.dot}"></span>A brand new logo designed from scratch for Top View Taxidermy</div>
  <div style="${s.cardItem}"><span style="${s.dot}"></span>Built to reflect the craft and legacy behind your business</div>
  <div style="${s.cardItem}"><span style="${s.dot}"></span>Delivered in every file format you need - web, print, hats, shirts, and more</div>

  <div style="${s.cardTitle}">&#128187; Website Design and Development</div>
  <div style="${s.cardItem}"><span style="${s.dot}"></span>A fully custom website built from the ground up - no templates, no shortcuts</div>
  <div style="${s.cardItem}"><span style="${s.dot}"></span>Looks great on phones, tablets, and desktops</div>
  <div style="${s.cardItem}"><span style="${s.dot}"></span>Dark, sharp design with a color palette that fits your brand</div>
  <div style="${s.cardItem}"><span style="${s.dot}"></span>Fast-loading and professional throughout</div>

  <div style="${s.cardTitle}">&#128248; Photo Gallery</div>
  <div style="${s.cardItem}"><span style="${s.dot}"></span>Photos organized by mount type so visitors find exactly what they are looking for</div>
  <div style="${s.cardItem}"><span style="${s.dot}"></span>Click any photo to open it full screen</div>
  <div style="${s.cardItem}"><span style="${s.dot}"></span>All photos professionally edited and color-corrected before going live</div>

  <div style="${s.cardTitle}">&#128269; Search Engine Setup</div>
  <div style="${s.cardItem}"><span style="${s.dot}"></span>Built so Google can find it - people searching for a taxidermist in Kenosha will find you</div>
  <div style="${s.cardItem}"><span style="${s.dot}"></span>Displays correctly on every phone with no awkward zooming</div>

  <div style="${s.cardTitle}">&#128640; Live on the Web</div>
  <div style="${s.cardItem}"><span style="${s.dot}"></span>Loads fast - nobody waits</div>
  <div style="${s.cardItem}"><span style="${s.dot}"></span>Hosted on a reliable platform that stays online</div>
  <div style="${s.cardItem}"><span style="${s.dot}"></span>Delivered clean with no bugs, ready for real visitors from day one</div>

  <div style="${s.sectionTitle}">Investment</div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <tr><td style="padding:8px 0;font-size:14px;color:#1a1a1a;border-bottom:1px solid #f0f0f0;">Setup Fee</td><td style="padding:8px 0;text-align:right;font-family:sans-serif;font-weight:500;color:#A87C4F;border-bottom:1px solid #f0f0f0;">$100</td></tr>
    <tr><td style="padding:8px 0;font-size:14px;color:#1a1a1a;border-bottom:1px solid #f0f0f0;">Custom Logo Design</td><td style="padding:8px 0;text-align:right;font-family:sans-serif;font-weight:500;color:#A87C4F;border-bottom:1px solid #f0f0f0;">$150</td></tr>
    <tr><td style="padding:8px 0;font-size:14px;color:#1a1a1a;border-bottom:1px solid #f0f0f0;">Website Design and Development</td><td style="padding:8px 0;text-align:right;font-family:sans-serif;font-weight:500;color:#A87C4F;border-bottom:1px solid #f0f0f0;">$250</td></tr>
    <tr style="background:rgba(168,124,79,0.08);"><td style="padding:10px 0;font-size:15px;font-weight:700;color:#1a1a1a;"><strong>One-Time Total</strong></td><td style="padding:10px 0;text-align:right;font-family:sans-serif;font-size:18px;font-weight:700;color:#A87C4F;"><strong>$500</strong></td></tr>
  </table>

  <div style="${s.guarantee}"><strong style="color:#2a7a5a;">100% Satisfaction Guarantee:</strong> If the client is not fully satisfied with the completed website and logo within 3 months of launch, Vivid Acuity, LLC will issue a full refund of all fees paid. This guarantee is void if the client has materially altered the delivered work.</div>

  <div style="${s.sigBlock}">
    <div style="${s.sigLabel}">Client Signature - Proposal</div>
    ${proposalSigHtml}
    <div style="${s.sigName}">${safeClientName}</div>
    <div style="${s.sigDate}">Signed ${safeProposalSignedAt}</div>
  </div>

  <!-- ═══════════════ SERVICE AGREEMENT ═══════════════ -->
  <div style="${s.sectionTitle}">Service Agreement - Signed</div>

  <div style="${s.row}"><div style="${s.label}">Agreement Signed</div><div style="${s.signed}">&#10003; ${safeContractSignedAt}</div></div>
  <div style="${s.row}"><div style="${s.label}">Effective Date</div><div style="${s.value}">March 31, 2025</div></div>
  <div style="${s.row}"><div style="${s.label}">Retainer Selected</div><div style="${s.value}">${retainerLabel}</div></div>
  <div style="${s.row}"><div style="${s.label}">Payment</div><div style="${s.price}">${formattedPaymentAmount} paid via Stripe</div></div>
  <div style="${s.row}"><div style="${s.label}">Governing Law</div><div style="${s.value}">State of Michigan</div></div>

  <div style="margin-top:24px;background:#fafafa;border:1px solid #eee;border-radius:6px;padding:24px;">
    <div style="${s.contractSection}"><div style="${s.contractTitle}">1. Parties</div><p style="${s.contractText}">This Service Agreement is entered into between Caleb Hingos, operating as Vivid Acuity, LLC (caleb@vividacuity.com), Upper Peninsula, Michigan - and Craig Reindl, operating as Top View Taxidermy, Kenosha, Wisconsin. Together referred to as the parties.</p></div>
    <div style="${s.contractSection}"><div style="${s.contractTitle}">2. Scope of Work</div><p style="${s.contractText}">Vivid Acuity, LLC has completed the following for Top View Taxidermy: (1) A custom logo designed from scratch, delivered in all required file formats. (2) A fully custom website including Home, About, Services, Gallery, Pricing and Policies, FAQ, Testimonials, and Contact sections - responsive across all devices, with a professionally edited photo gallery, search engine setup, and live deployment.</p></div>
    <div style="${s.contractSection}"><div style="${s.contractTitle}">3. Project Fees</div><p style="${s.contractText}">Setup Fee: $100 - Custom Logo Design: $150 - Website Design and Development: $250 - One-Time Total: $500. Full payment of $500.00 is due upon signing this agreement, processed via Stripe.</p></div>
    <div style="${s.contractSection}"><div style="${s.contractTitle}">4. Ongoing Maintenance Retainer</div><p style="${s.contractText}">Following the one-time payment, an optional maintenance retainer is available. Monthly Plan: $30/month. Annual Plan: $300/year (saves $60). Covers hosting oversight, uptime monitoring, minor content updates, and dependency maintenance. Either party may cancel with 30 days written notice.</p></div>
    <div style="${s.contractSection}"><div style="${s.contractTitle}">5. Payment Terms</div><p style="${s.contractText}">Full one-time balance of $500.00 is due upon signing. Retainer (if elected) begins on the first of the month following signing. Payment via Stripe. Balances unpaid after 15 days are subject to 1.5% monthly interest. Intellectual property transfers to the client upon receipt of full payment.</p></div>
    <div style="${s.contractSection}"><div style="${s.contractTitle}">6. Intellectual Property</div><p style="${s.contractText}">Upon receipt of full payment, all rights to the logo and website - including all design files, code, and content - transfer fully to Craig Reindl / Top View Taxidermy. Vivid Acuity, LLC retains the right to display the work in its portfolio and marketing materials.</p></div>
    <div style="${s.contractSection}"><div style="${s.contractTitle}">7. Revisions</div><p style="${s.contractText}">Up to 2 rounds of revisions are included. Additional revisions are billed at $75.00/hour. Revision requests must be submitted in writing.</p></div>
    <div style="${s.contractSection}"><div style="${s.contractTitle}">8. Satisfaction Guarantee</div><p style="${s.contractText}">If the client is not fully satisfied with the completed website and logo within 3 months of launch, Vivid Acuity, LLC will issue a full refund of all fees paid. This guarantee is void if the client has materially altered the delivered work.</p></div>
    <div style="${s.contractSection}"><div style="${s.contractTitle}">9. Limitation of Liability</div><p style="${s.contractText}">Total liability of Vivid Acuity, LLC is limited to the total fees paid under this agreement. Vivid Acuity, LLC is not liable for any indirect, incidental, or consequential damages.</p></div>
    <div style="${s.contractSection}"><div style="${s.contractTitle}">10. Termination</div><p style="${s.contractText}">Either party may terminate with 14 days written notice. Upon termination, the client owes fees for all work completed to that date. One-time fees are non-refundable once deliverables are provided. The satisfaction guarantee supersedes this clause where applicable.</p></div>
    <div style="${s.contractSection}"><div style="${s.contractTitle}">11. Governing Law</div><p style="${s.contractText}">This agreement is governed by the laws of the State of Michigan.</p></div>
    <div style="${s.contractSection}"><div style="${s.contractTitle}">Effective Date</div><p style="${s.contractText}">March 31, 2025</p></div>
  </div>

  <div style="${s.sigBlock}">
    <div style="${s.sigLabel}">Client Signature - Service Agreement</div>
    ${contractSigHtml}
    <div style="${s.sigName}">${safeClientName} - Top View Taxidermy</div>
    <div style="${s.sigDate}">Signed ${safeContractSignedAt}</div>
  </div>

  <div style="${s.sigBlock}">
    <div style="${s.sigLabel}">Vivid Acuity, LLC</div>
    <div style="height:40px;border-bottom:1.5px solid #1a1a1a;margin:8px 0;"></div>
    <div style="${s.sigName}">Caleb Hingos - Vivid Acuity, LLC</div>
    <div style="${s.sigDate}">${now}</div>
  </div>

  <div style="margin-top:32px;background:rgba(58,182,211,0.08);border:1px solid rgba(58,182,211,0.2);border-radius:6px;padding:20px;text-align:center;">
    <p style="color:#2a7a5a;font-family:sans-serif;font-size:13px;margin:0;">All done. Reach out to Craig to confirm everything is live.</p>
  </div>
</div>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Vivid Acuity <onboarding@resend.dev>',
        to: ['caleb@vividacuity.com'],
        subject: `Signed Documents - ${normalizedClientName} / Top View Taxidermy`,
        html,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      return res.status(200).json({ success: true, id: data.id });
    } else {
      return res.status(response.status).json({ error: data });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
