// Vercel Serverless Function

const VALID_RETAINERS = new Set(['none', 'monthly', 'annual'])
const OWNER_NAME = 'Caleb Hingos'
const COMPANY_NAME = 'Vivid Acuity, LLC'

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return entities[char]
  })
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
}

function buildProposalHtml({ safeClientName, safeProposalSignedAt, now, proposalSigCid, ownerSigCid }) {
  const clientSigHtml = buildSigHtml(proposalSigCid)
  const ownerSigHtml = buildSigHtml(ownerSigCid)
  return `<div style="${S.body}">
  <div style="${S.coName}">${COMPANY_NAME}</div>
  <h1 style="${S.h1}">Project Proposal</h1>
  <div style="${S.subtitle}">Prepared for ${safeClientName} / Top View Taxidermy &mdash; ${now}</div>

  <div style="${S.row}"><div style="${S.label}">Client</div><div style="${S.value}">${safeClientName}</div></div>
  <div style="${S.row}"><div style="${S.label}">Business</div><div style="${S.value}">Top View Taxidermy, Kenosha WI</div></div>
  <div style="${S.row}"><div style="${S.label}">Proposal Finalized</div><div style="${S.signed}">&#10003; ${safeProposalSignedAt}</div></div>

  <div style="${S.sectionTitle}">Deliverables</div>

  <div style="${S.cardTitle}">&#127912; Custom Logo Design</div>
  <div style="${S.cardItem}"><span style="${S.dot}"></span>A brand new logo designed from scratch for Top View Taxidermy.</div>
  <div style="${S.cardItem}"><span style="${S.dot}"></span>Built to reflect the craft and legacy behind the business.</div>
  <div style="${S.cardItem}"><span style="${S.dot}"></span>Delivered in every file format needed for web, print, hats, shirts, and more.</div>

  <div style="${S.cardTitle}">&#128187; Website Design and Development</div>
  <div style="${S.cardItem}"><span style="${S.dot}"></span>A fully custom website built from the ground up with no templates.</div>
  <div style="${S.cardItem}"><span style="${S.dot}"></span>Responsive across phones, tablets, and desktops.</div>
  <div style="${S.cardItem}"><span style="${S.dot}"></span>Dark, sharp design with a color palette that fits the brand.</div>
  <div style="${S.cardItem}"><span style="${S.dot}"></span>Fast-loading and professional throughout.</div>

  <div style="${S.cardTitle}">&#128248; Photo Gallery</div>
  <div style="${S.cardItem}"><span style="${S.dot}"></span>Photos organized by mount type so visitors can find what they want quickly.</div>
  <div style="${S.cardItem}"><span style="${S.dot}"></span>Click any photo to open it full screen.</div>
  <div style="${S.cardItem}"><span style="${S.dot}"></span>All photos professionally edited and color-corrected before going live.</div>

  <div style="${S.cardTitle}">&#128269; Search Engine Setup</div>
  <div style="${S.cardItem}"><span style="${S.dot}"></span>Built so Google can find it when people search for a taxidermist in Kenosha.</div>
  <div style="${S.cardItem}"><span style="${S.dot}"></span>Displays correctly on every phone with no awkward zooming.</div>

  <div style="${S.cardTitle}">&#128640; Live on the Web</div>
  <div style="${S.cardItem}"><span style="${S.dot}"></span>Loads fast so nobody waits.</div>
  <div style="${S.cardItem}"><span style="${S.dot}"></span>Hosted on a reliable platform that stays online.</div>
  <div style="${S.cardItem}"><span style="${S.dot}"></span>Delivered clean with no bugs and ready for real visitors from day one.</div>

  <div style="${S.sectionTitle}">Investment</div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <tr><td style="padding:8px 0;font-size:14px;border-bottom:1px solid #f0f0f0;">Setup Fee</td><td style="padding:8px 0;text-align:right;font-family:sans-serif;font-weight:500;color:#A87C4F;border-bottom:1px solid #f0f0f0;">$100</td></tr>
    <tr><td style="padding:8px 0;font-size:14px;border-bottom:1px solid #f0f0f0;">Custom Logo Design</td><td style="padding:8px 0;text-align:right;font-family:sans-serif;font-weight:500;color:#A87C4F;border-bottom:1px solid #f0f0f0;">$150</td></tr>
    <tr><td style="padding:8px 0;font-size:14px;border-bottom:1px solid #f0f0f0;">Website Design and Development</td><td style="padding:8px 0;text-align:right;font-family:sans-serif;font-weight:500;color:#A87C4F;border-bottom:1px solid #f0f0f0;">$250</td></tr>
    <tr style="background:rgba(168,124,79,0.08);"><td style="padding:10px 0;font-size:15px;font-weight:700;"><strong>One-Time Total</strong></td><td style="padding:10px 0;text-align:right;font-family:sans-serif;font-size:18px;font-weight:700;color:#A87C4F;"><strong>$500</strong></td></tr>
  </table>

  <div style="${S.guarantee}"><strong style="color:#2a7a5a;">100% Satisfaction Guarantee:</strong> If the client is not fully satisfied with the completed website and logo within 3 months of launch, Vivid Acuity, LLC will issue a full refund of all fees paid. This guarantee is void if the client has materially altered the delivered work.</div>

  <div style="display:flex;gap:36px;flex-wrap:wrap;margin-top:28px;padding-top:16px;border-top:1px solid #eee;">
    <div style="flex:1;min-width:220px;">
      <div style="${S.sigLabel}">Client</div>
      ${clientSigHtml}
      <div style="${S.sigName}">${safeClientName}</div>
      <div style="${S.sigDate}">Signed ${safeProposalSignedAt}</div>
    </div>
    <div style="flex:1;min-width:220px;">
      <div style="${S.sigLabel}">${COMPANY_NAME}</div>
      ${ownerSigHtml}
      <div style="${S.sigName}">${OWNER_NAME} &mdash; ${COMPANY_NAME}</div>
      <div style="${S.sigDate}">Applied automatically after payment on ${safeProposalSignedAt}</div>
    </div>
  </div>
</div>`
}

function buildAgreementHtml({ safeClientName, safeContractSignedAt, retainerLabel, formattedPaymentAmount, effectiveDate, now, contractSigCid, ownerSigCid }) {
  const clientSigHtml = buildSigHtml(contractSigCid)
  const ownerSigHtml = buildSigHtml(ownerSigCid)
  return `<div style="${S.body}">
  <div style="${S.coName}">${COMPANY_NAME}</div>
  <h1 style="${S.h1}">Service Agreement</h1>
  <div style="${S.subtitle}">Top View Taxidermy &mdash; ${safeClientName} &mdash; ${now}</div>

  <div style="${S.row}"><div style="${S.label}">Agreement Finalized</div><div style="${S.signed}">&#10003; ${safeContractSignedAt}</div></div>
  <div style="${S.row}"><div style="${S.label}">Effective Date</div><div style="${S.value}">${effectiveDate}</div></div>
  <div style="${S.row}"><div style="${S.label}">Retainer Selected</div><div style="${S.value}">${retainerLabel}</div></div>
  <div style="${S.row}"><div style="${S.label}">Payment</div><div style="${S.price}">${formattedPaymentAmount}</div></div>
  <div style="${S.row}"><div style="${S.label}">Governing Law</div><div style="${S.value}">State of Michigan</div></div>

  <div style="${S.sectionTitle}">Agreement Terms</div>
  <div style="background:#fafafa;border:1px solid #eee;border-radius:6px;padding:24px;margin-bottom:16px;">
    <div style="margin-bottom:14px;"><div style="${S.clauseTitle}">1. Parties</div><p style="${S.clauseText}">This Service Agreement is entered into between Caleb Hingos, operating as Vivid Acuity, LLC (caleb@vividacuity.com), Upper Peninsula, Michigan, and Craig Reindl, operating as Top View Taxidermy, Kenosha, Wisconsin.</p></div>
    <div style="margin-bottom:14px;"><div style="${S.clauseTitle}">2. Scope of Work</div><p style="${S.clauseText}">Vivid Acuity, LLC has completed a custom logo and a fully custom website including responsive design, edited gallery assets, search engine setup, and live deployment.</p></div>
    <div style="margin-bottom:14px;"><div style="${S.clauseTitle}">3. Project Fees</div><p style="${S.clauseText}">Setup Fee: $100. Custom Logo Design: $150. Website Design and Development: $250. One-time project total: $500, due upon signing this agreement.</p></div>
    <div style="margin-bottom:14px;"><div style="${S.clauseTitle}">4. Ongoing Maintenance</div><p style="${S.clauseText}">Optional maintenance may be selected as either $30/month or $300/year. Coverage includes hosting oversight, uptime monitoring, minor content updates, and dependency maintenance.</p></div>
    <div style="margin-bottom:14px;"><div style="${S.clauseTitle}">5. Payment Terms</div><p style="${S.clauseText}">Full one-time balance is due upon signing. Monthly maintenance begins May 1, 2026 if selected. Annual maintenance covers May 1, 2026 through May 1, 2027 if selected.</p></div>
    <div style="margin-bottom:14px;"><div style="${S.clauseTitle}">6. Intellectual Property</div><p style="${S.clauseText}">Upon receipt of full payment, all rights to the logo and website transfer fully to Craig Reindl / Top View Taxidermy. Vivid Acuity may still display the work in its portfolio.</p></div>
    <div style="margin-bottom:14px;"><div style="${S.clauseTitle}">7. Revisions</div><p style="${S.clauseText}">Up to two rounds of revisions are included. Additional revisions are billed at $75/hour and must be requested in writing.</p></div>
    <div style="margin-bottom:14px;"><div style="${S.clauseTitle}">8. Satisfaction Guarantee</div><p style="${S.clauseText}">If the client is not fully satisfied with the completed website and logo within 3 months of launch, Vivid Acuity, LLC will issue a full refund of all fees paid.</p></div>
    <div style="margin-bottom:14px;"><div style="${S.clauseTitle}">9. Limitation of Liability</div><p style="${S.clauseText}">Total liability of Vivid Acuity, LLC is limited to the total fees paid under this agreement.</p></div>
    <div style="margin-bottom:14px;"><div style="${S.clauseTitle}">10. Governing Law</div><p style="${S.clauseText}">This agreement is governed by the laws of the State of Michigan.</p></div>
    <div><div style="${S.clauseTitle}">Effective Date</div><p style="${S.clauseText}">${effectiveDate}</p></div>
  </div>

  <div style="${S.sigBlock}">
    <div style="${S.sigLabel}">Client</div>
    ${clientSigHtml}
    <div style="${S.sigName}">${safeClientName} &mdash; Top View Taxidermy</div>
    <div style="${S.sigDate}">Signed ${safeContractSignedAt}</div>
  </div>

  <div style="${S.sigBlock}">
    <div style="${S.sigLabel}">${COMPANY_NAME}</div>
    ${ownerSigHtml}
    <div style="${S.sigName}">${OWNER_NAME} &mdash; ${COMPANY_NAME}</div>
    <div style="${S.sigDate}">Applied automatically after payment on ${safeContractSignedAt}</div>
  </div>
</div>`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { clientName, retainer, proposalSignedAt, contractSignedAt, paymentAmount, proposalSigImage, contractSigImage, ownerSigImage } = req.body;

  const resendApiKey = process.env.RESEND_API_KEY;
  const normalizedClientName = typeof clientName === 'string' ? clientName.trim() : '';
  const normalizedProposalSignedAt = typeof proposalSignedAt === 'string' ? proposalSignedAt.trim() : '';
  const normalizedContractSignedAt = typeof contractSignedAt === 'string' ? contractSignedAt.trim() : '';
  const numericPaymentAmount = Number(paymentAmount);

  if (!resendApiKey) return res.status(500).json({ error: 'Server email configuration is missing.' });
  if (!normalizedClientName) return res.status(400).json({ error: 'Client name is required.' });
  if (!VALID_RETAINERS.has(retainer)) return res.status(400).json({ error: 'A valid retainer plan is required.' });
  if (!normalizedProposalSignedAt || !normalizedContractSignedAt) return res.status(400).json({ error: 'Proposal and agreement signatures are required.' });
  if (!Number.isFinite(numericPaymentAmount) || numericPaymentAmount <= 0) return res.status(400).json({ error: 'Payment amount must be greater than 0.' });

  const retainerLabel = retainer === 'monthly' ? '$30/month' : retainer === 'annual' ? '$300/year' : 'None selected';
  const now = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
  const effectiveDate = new Date().toLocaleDateString('en-US', { dateStyle: 'long' });
  const formattedPaymentAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(numericPaymentAmount);
  const safeClientName = escapeHtml(normalizedClientName);
  const safeProposalSignedAt = escapeHtml(normalizedProposalSignedAt);
  const safeContractSignedAt = escapeHtml(normalizedContractSignedAt);

  const proposalSigAsset = extractInlineImage(proposalSigImage);
  const contractSigAsset = extractInlineImage(contractSigImage);
  const ownerSigAsset = extractInlineImage(ownerSigImage);

  // Build Email 1: Signed Proposal
  const proposalAttachments = [];
  const proposalSigCid = proposalSigAsset ? 'proposal-signature' : null;
  const ownerSigCid = ownerSigAsset ? 'owner-signature' : null;
  if (proposalSigAsset) {
    proposalAttachments.push({
      filename: `proposal-signature.${proposalSigAsset.extension}`,
      content: proposalSigAsset.content,
      content_type: proposalSigAsset.contentType,
      disposition: 'inline',
      content_id: 'proposal-signature',
    });
  }
  if (ownerSigAsset) {
    proposalAttachments.push({
      filename: `owner-signature.${ownerSigAsset.extension}`,
      content: ownerSigAsset.content,
      content_type: ownerSigAsset.contentType,
      disposition: 'inline',
      content_id: 'owner-signature',
    });
  }
  const proposalHtml = buildProposalHtml({ safeClientName, safeProposalSignedAt, now, proposalSigCid, ownerSigCid });

  // Build Email 2: Signed Agreement
  const agreementAttachments = [];
  const contractSigCid = contractSigAsset ? 'contract-signature' : null;
  if (contractSigAsset) {
    agreementAttachments.push({
      filename: `contract-signature.${contractSigAsset.extension}`,
      content: contractSigAsset.content,
      content_type: contractSigAsset.contentType,
      disposition: 'inline',
      content_id: 'contract-signature',
    });
  }
  if (ownerSigAsset) {
    agreementAttachments.push({
      filename: `owner-signature.${ownerSigAsset.extension}`,
      content: ownerSigAsset.content,
      content_type: ownerSigAsset.contentType,
      disposition: 'inline',
      content_id: 'owner-signature',
    });
  }
  const agreementHtml = buildAgreementHtml({ safeClientName, safeContractSignedAt, retainerLabel, formattedPaymentAmount, effectiveDate, now, contractSigCid, ownerSigCid });

  try {
    const headers = { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' };
    const to = ['caleb@vividacuity.com'];
    const from = 'Vivid Acuity <onboarding@resend.dev>';

    const [proposalRes, agreementRes] = await Promise.all([
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from, to,
          subject: `Signed Proposal - ${normalizedClientName} / Top View Taxidermy`,
          html: proposalHtml,
          attachments: proposalAttachments.length ? proposalAttachments : undefined,
        }),
      }),
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          from, to,
          subject: `Signed Agreement - ${normalizedClientName} / Top View Taxidermy`,
          html: agreementHtml,
          attachments: agreementAttachments.length ? agreementAttachments : undefined,
        }),
      }),
    ]);

    const proposalData = await proposalRes.json().catch(() => ({}));
    const agreementData = await agreementRes.json().catch(() => ({}));

    if (!proposalRes.ok || !agreementRes.ok) {
      const errors = [];
      if (!proposalRes.ok) errors.push({ type: 'proposal', error: proposalData });
      if (!agreementRes.ok) errors.push({ type: 'agreement', error: agreementData });
      return res.status(500).json({ error: 'One or more emails failed to send.', details: errors });
    }

    return res.status(200).json({ success: true, proposalId: proposalData.id, agreementId: agreementData.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
