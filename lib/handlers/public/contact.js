// api/contact.js  — Phase 1: Contact form handler
// Saves submission to Supabase, emails admin via Resend

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// ─── Clients (pulled from Vercel env vars — never hardcode these) ────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY   // service_role, NOT anon
);
const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = 'ashantiregionalsrc@gmail.com';

// ─── Sanitize for safe HTML email output ────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Main handler ────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // Allow preflight (browser sends OPTIONS before POST cross-origin)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  // ── 1. Extract + validate ──────────────────────────────────────────────────
  const { name, email, subject, message } = req.body || {};

  if (!name?.trim() || !email?.trim() || !subject?.trim() || !message?.trim()) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (message.trim().length < 10) {
    return res.status(400).json({ error: 'Message is too short.' });
  }

  const clean = {
    name:    name.trim(),
    email:   email.trim().toLowerCase(),
    subject: subject.trim(),
    message: message.trim(),
  };

  // ── 2. Save to Supabase ────────────────────────────────────────────────────
  // If this fails, stop immediately — don't send a blank email notification
  const { error: dbError } = await supabase
    .from('contact_messages')
    .insert([clean]);

  if (dbError) {
    console.error('[ARSRC] Supabase insert error:', dbError);
    // Most common cause: table doesn't exist, or wrong key (anon vs service_role)
    return res.status(500).json({
      error: 'Could not save your message. Please try again later.',
    });
  }

  // ── 3. Email admin via Resend ──────────────────────────────────────────────
  // ⚠️  SENDER: currently using Resend's test address.
  //     Once you verify arsrcvercel.app in Resend dashboard → DNS records,
  //     change the `from` line to: 'ARSRC Contact <noreply@arsrcvercel.app>'
  const { error: emailError } = await resend.emails.send({
    from:     'ARSRC Contact Form <onboarding@resend.dev>',
    to:       ADMIN_EMAIL,
    reply_to: clean.email,   // so you can hit Reply in Gmail and it goes to sender
    subject:  `[ARSRC] ${esc(clean.subject)}`,
    html: `
      <div style="font-family:sans-serif;max-width:580px;margin:0 auto;">
        <!-- Header -->
        <div style="background:#102a6b;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:18px;">New Contact Form Submission</h2>
          <p style="color:rgba(255,255,255,0.65);margin:6px 0 0;font-size:13px;">via arsrcvercel.app · ${new Date().toUTCString()}</p>
        </div>
        <!-- Body -->
        <div style="background:#f4f7fc;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e3e9f7;border-top:none;">
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#64748b;width:80px;vertical-align:top;">Name</td>
              <td style="padding:8px 0;font-weight:700;color:#0f1c3f;">${esc(clean.name)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#64748b;vertical-align:top;">Email</td>
              <td style="padding:8px 0;font-weight:700;color:#1d4ed8;">
                <a href="mailto:${esc(clean.email)}" style="color:#1d4ed8;">${esc(clean.email)}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#64748b;vertical-align:top;">Subject</td>
              <td style="padding:8px 0;font-weight:700;color:#0f1c3f;">${esc(clean.subject)}</td>
            </tr>
          </table>
          <hr style="border:none;border-top:1px solid #e3e9f7;margin:0 0 16px;">
          <p style="font-size:12px;color:#64748b;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">Message</p>
          <p style="font-size:15px;color:#0f1c3f;line-height:1.75;white-space:pre-wrap;margin:0;">${esc(clean.message)}</p>
          <hr style="border:none;border-top:1px solid #e3e9f7;margin:20px 0 14px;">
          <p style="font-size:12px;color:#94a3b8;margin:0;">
            Hit <strong>Reply</strong> to respond directly to ${esc(clean.name)} — 
            reply_to is set to their address automatically.
          </p>
        </div>
      </div>
    `,
  });

  if (emailError) {
    // Message IS saved — don't punish the visitor for a Resend hiccup.
    // Log it so you can see it in Vercel's function logs.
    console.error('[ARSRC] Resend email error (message was saved):', emailError);
    return res.status(200).json({ success: true, emailFailed: true });
  }

  return res.status(200).json({ success: true });
};
