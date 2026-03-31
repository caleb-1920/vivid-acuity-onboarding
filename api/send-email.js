// Vercel Serverless Function
// Save this file to: /api/send-email.js in your Vercel project
// Vercel will automatically deploy it as a serverless endpoint

export default async function handler(req, res) {
  // Allow requests from your frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { clientName, retainer, proposalSignedAt, contractSignedAt, paymentAmount } = req.body;

  const retainerLabel = retainer === 'monthly' ? '$30/month' : retainer === 'annual' ? '$300/year' : 'None selected';
  const now = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });

  const html = `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #0a0a0c; color: #e8ddd0; padding: 40px; border-radius: 8px;">
      <div style="text-align:center; margin-bottom: 32px;">
        <div style="font-family: sans-serif; font-size: 11px; letter-spacing: 0.25em; text-transform: uppercase; color: #eb6611; margin-bottom: 8px;">Vivid Acuity</div>
        <h1 style="font-family: sans-serif; font-size: 28px; color: #FAF6F0; margin: 0;">New Client Signed</h1>
        <p style="color: #7a7060; font-size: 13px; margin-top: 8px;">${now}</p>
      </div>
      <div style="background: #111115; border: 1px solid rgba(168,124,79,0.25); border-radius: 6px; padding: 24px; margin-bottom: 16px;">
        <div style="font-family: sans-serif; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: #A87C4F; margin-bottom: 16px;">Client</div>
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:8px 0; color:#7a7060; font-size:13px; width:160px;">Name</td><td style="padding:8px 0; color:#FAF6F0; font-size:14px; font-weight:bold;">${clientName}</td></tr>
          <tr><td style="padding:8px 0; color:#7a7060; font-size:13px;">Business</td><td style="padding:8px 0; color:#FAF6F0; font-size:14px;">Top View Taxidermy</td></tr>
        </table>
      </div>
      <div style="background: #111115; border: 1px solid rgba(168,124,79,0.25); border-radius: 6px; padding: 24px; margin-bottom: 16px;">
        <div style="font-family: sans-serif; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: #A87C4F; margin-bottom: 16px;">Documents Signed</div>
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:8px 0; color:#7a7060; font-size:13px; width:160px;">Proposal</td><td style="padding:8px 0; font-size:14px; color:#3ab6d3;">✓ Signed - ${proposalSignedAt}</td></tr>
          <tr><td style="padding:8px 0; color:#7a7060; font-size:13px;">Agreement</td><td style="padding:8px 0; font-size:14px; color:#3ab6d3;">✓ Signed - ${contractSignedAt}</td></tr>
        </table>
      </div>
      <div style="background: #111115; border: 1px solid rgba(168,124,79,0.25); border-radius: 6px; padding: 24px; margin-bottom: 16px;">
        <div style="font-family: sans-serif; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: #A87C4F; margin-bottom: 16px;">Payment and Retainer</div>
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:8px 0; color:#7a7060; font-size:13px; width:160px;">Payment</td><td style="padding:8px 0; color:#C9A87A; font-size:18px; font-weight:bold; font-family:sans-serif;">$${paymentAmount}</td></tr>
          <tr><td style="padding:8px 0; color:#7a7060; font-size:13px;">Retainer</td><td style="padding:8px 0; color:#FAF6F0; font-size:14px;">${retainerLabel}</td></tr>
          <tr><td style="padding:8px 0; color:#7a7060; font-size:13px;">Effective</td><td style="padding:8px 0; color:#FAF6F0; font-size:14px;">March 31, 2025</td></tr>
        </table>
      </div>
      <div style="background:rgba(58,182,211,0.1); border:1px solid rgba(58,182,211,0.3); border-radius:6px; padding:20px; text-align:center;">
        <p style="color:#3ab6d3; font-family:sans-serif; font-size:13px; margin:0;">All done. Reach out to Craig to confirm everything is live.</p>
      </div>
    </div>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer re_ZBuA9erz_8PhtWttaoUHD9W21rqLjPZqv',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Vivid Acuity <onboarding@resend.dev>',
        to: ['caleb@vividacuity.com'],
        subject: `New Signed Client - ${clientName} / Top View Taxidermy`,
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
