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

Includes a hidden honeypot field for spam. If sending fails, the visitor is offered email and phone instead.
