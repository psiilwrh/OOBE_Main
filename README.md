# oobe-site

Website for OOBE (Out of Box Experience Inc.): IT, cloud, AI and unified communications. Toronto, serving Canada and the US.

Static HTML on Vercel (`cleanUrls` on). No build step.

## Pages
- `index.html` home: live tile hero (canvas), services explorer, environment map, AI, Cloud IP Phone, process, FAQ
- `services.html`, `cloud-ip-phone.html`, `about.html`, `contact.html`, `404.html`

## Shared
- `styles.css` design tokens (Space Grotesk, Inter, JetBrains Mono; orange #F19828, blue #0072B5, navy #0E2A47), light and dark
- `site.js` tile field, 2x2 service glyphs, gauges, tile strip, services explorer, nav, contact form (posts to /api/contact, email app only as a fallback)

## Voice
No em or en dashes, no exclamation marks, Canadian spelling, plain confident tone.

## Contact form
`contact.html` posts JSON to `api/contact.js` (Vercel function), which emails the request to info@oobe.ca through Resend.

Vercel environment variables:
- `RESEND_API_KEY` (required): API key from resend.com, with oobe.ca verified as a sending domain
- `CONTACT_TO` (optional): inbox for requests, default `info@oobe.ca`
- `CONTACT_FROM` (optional): sender, default `OOBE Website <website@oobe.ca>`
- `TURNSTILE_SECRET_KEY`: secret key of the Cloudflare Turnstile widget. Without it the server skips the Turnstile check

Spam protection: Cloudflare Turnstile (widget in `contact.html`, token verified in `api/contact.js`), a hidden honeypot field and a best effort rate limit of 5 requests per address per 10 minutes. The Turnstile site key is the `data-sitekey` attribute in `contact.html`. If sending fails, the visitor is offered email and phone instead.

## Structured data (SEO and AI search)
Each page carries one JSON-LD block, generated from the page content by `scripts/schema.py`:
Organization (ProfessionalService), WebSite, WebPage/AboutPage/ContactPage/CollectionPage, breadcrumbs,
the 8 services, Cloud IP Phone with its plans, and FAQPage for every FAQ section.

After editing FAQs, services or plans, run `python3 scripts/schema.py` and commit the result.

## Images
- `images/oobe-og.png` (1200x630): preview image for links shared on LinkedIn, Teams, WhatsApp, etc. and for AI citations
- `images/oobe-logo.png` (1200x400) and `images/oobe-mark-512.png`: raster logos for Google and other platforms

Files in `/images` are cached for a year (`vercel.json`), so give a changed image a new file name.
- Icons: `favicon.ico` (16/32/48), `favicon.svg`, `images/favicon-96.png`, `apple-touch-icon.png` (180), `images/icon-192.png` and `images/icon-512.png` (referenced by `site.webmanifest`), all from the orange OOBE mark
