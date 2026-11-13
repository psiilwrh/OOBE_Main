/*
 * Contact form handler for oobe.ca
 * Receives the intake form as JSON and emails it to the OOBE inbox through Resend.
 *
 * Environment variables (Vercel > Project > Settings > Environment Variables):
 *   RESEND_API_KEY   required. API key from resend.com
 *   CONTACT_TO       optional. Inbox that receives requests (default info@oobe.ca)
 *   CONTACT_FROM     optional. Sender on a domain verified in Resend
 *                    (default "OOBE Website <website@oobe.ca>")
 *   TURNSTILE_SECRET_KEY  required. Secret key of the Cloudflare Turnstile widget. Without it
 *                    the form answers 503 and sends nothing.
 *   TURNSTILE_HOSTNAMES   optional. Comma separated hostnames a token may come from
 *                    (default "oobe.ca,www.oobe.ca"). Never list localhost in Production.
 *
 * Spam protection, in order: per-address rate limit, honeypot field, Turnstile token check.
 */

// Rate limit: at most RATE_MAX requests per address in RATE_WINDOW_MS. Kept in memory, so it is
// per function instance and best effort. It stops bursts; Turnstile does the real filtering.
const RATE_MAX = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const hits = new Map();

function clientIp(req) {
  const h = req.headers || {};
  const raw = h['x-real-ip'] || h['x-forwarded-for'] || '';
  return String(Array.isArray(raw) ? raw[0] : raw).split(',')[0].trim();
}

function rateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  if (hits.size > 5000) {
    for (const [k, list] of hits) if (!list.length || now - list[list.length - 1] > RATE_WINDOW_MS) hits.delete(k);
  }
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) { hits.set(ip, recent); return true; }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

const TURNSTILE_ACTION = 'contact';

// Returns true only when Cloudflare confirms the token for this form and this site.
// Anything else (bad token, timeout, network error, odd response) counts as a failure.
// Tokens are single use and expire after 5 minutes.
async function verifyTurnstile(secret, token, ip) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const allowed = (process.env.TURNSTILE_HOSTNAMES || 'oobe.ca,www.oobe.ca')
    .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  try {
    const params = new URLSearchParams({ secret, response: token });
    if (ip) params.set('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: params,
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) { console.error('contact: Turnstile siteverify status', r.status); return false; }
    const out = await r.json();
    if (!out || out.success !== true) {
      console.warn('contact: Turnstile rejected', ((out && out['error-codes']) || []).join(','));
      return false;
    }
    if (out.action !== TURNSTILE_ACTION) { console.warn('contact: Turnstile action mismatch', out.action); return false; }
    if (!allowed.includes(String(out.hostname || '').toLowerCase())) {
      console.warn('contact: Turnstile hostname not allowed', out.hostname);
      return false;
    }
    return true;
  } catch (err) {
    console.error('contact: Turnstile check failed', err && err.message);
    return false;
  }
}

const MAX = { name: 120, company: 160, email: 200, phone: 40, message: 5000, interest: 400 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(value, max) {
  if (typeof value !== 'string') return '';
  // strip control characters (keeps line breaks and tabs) and trim
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return null; }
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    res.setHeader('Retry-After', String(RATE_WINDOW_MS / 1000));
    return res.status(429).json({ ok: false, error: 'rate_limited' });
  }

  const body = readBody(req);
  if (!body) return res.status(400).json({ ok: false, error: 'invalid_request' });

  // Honeypot: real visitors never see or fill this field. Pretend success so bots move on.
  if (clean(body.website, 200)) return res.status(200).json({ ok: true });

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (!turnstileSecret) {
    console.error('contact: TURNSTILE_SECRET_KEY is not set');
    return res.status(503).json({ ok: false, error: 'not_configured' });
  }
  if (!(await verifyTurnstile(turnstileSecret, body['cf-turnstile-response'], ip))) {
    return res.status(403).json({ ok: false, error: 'verification_failed' });
  }

  const interests = Array.isArray(body.interest) ? body.interest : body.interest ? [body.interest] : [];
  const data = {
    name: clean(body.name, MAX.name),
    company: clean(body.company, MAX.company),
    email: clean(body.email, MAX.email),
    phone: clean(body.phone, MAX.phone),
    message: clean(body.message, MAX.message),
    interest: clean(interests.filter((i) => typeof i === 'string').join(', '), MAX.interest),
  };

  const missing = [];
  if (!data.name) missing.push('name');
  if (!EMAIL_RE.test(data.email)) missing.push('email');
  if (missing.length) return res.status(422).json({ ok: false, error: 'invalid_fields', fields: missing });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('contact: RESEND_API_KEY is not set');
    return res.status(503).json({ ok: false, error: 'not_configured' });
  }

  const to = process.env.CONTACT_TO || 'info@oobe.ca';
  const from = process.env.CONTACT_FROM || 'OOBE Website <website@oobe.ca>';

  const rows = [
    ['Name', data.name],
    ['Company', data.company || 'Not given'],
    ['Email', data.email],
    ['Phone', data.phone || 'Not given'],
    ['Interested in', data.interest || 'Not specified'],
  ];

  const text =
    rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
    `\n\nMessage:\n${data.message || '(no message)'}\n\nSent from the contact form on www.oobe.ca`;

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0E2A47">` +
    `<h2 style="margin:0 0 12px">New consultation request</h2>` +
    `<table cellpadding="6" style="border-collapse:collapse">` +
    rows.map(([k, v]) => `<tr><td style="color:#5b6b78;vertical-align:top">${k}</td><td><b>${escapeHtml(v)}</b></td></tr>`).join('') +
    `</table>` +
    `<p style="margin:16px 0 4px;color:#5b6b78">Message</p>` +
    `<p style="white-space:pre-wrap;margin:0">${escapeHtml(data.message || '(no message)')}</p>` +
    `<p style="margin-top:20px;font-size:12px;color:#8a97a3">Sent from the contact form on www.oobe.ca. Reply to this email to answer ${escapeHtml(data.name)} directly.</p>` +
    `</div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: data.email,
        subject: `Consultation request from ${data.name}${data.company ? ' (' + data.company + ')' : ''}`,
        text,
        html,
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('contact: Resend error', r.status, detail.slice(0, 500));
      return res.status(502).json({ ok: false, error: 'send_failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('contact: request to Resend failed', err && err.message);
    return res.status(502).json({ ok: false, error: 'send_failed' });
  }
};
