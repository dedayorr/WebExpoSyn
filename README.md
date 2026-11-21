<p align="center">
  <img src="src/assets/logo-icon.png" alt="WebExpoSyn logo" height="96" />
</p>

<h1 align="center">WebExpoSyn</h1>

<p align="center">
  <strong>Website Security Posture &amp; Exposure Assessment Platform</strong><br />
  Enter your website. Discover security weaknesses. Understand what to fix.
</p>

---

WebExpoSyn lets individuals and businesses check how securely their websites are configured, spot common weaknesses, understand the risks and get practical instructions for fixing them. It is not an uptime checker. It is a lightweight security assessment tool.

> **Key design decision:** WebExpoSyn never tells you your site is "85% secure." Every report shows exactly **what was tested**, **what passed**, **what failed** and **what could not be verified**.

This repository contains:

- **Frontend** (repo root): React + TypeScript + Vite + Tailwind CSS, connected to the API. Scan results are kept on your device per account until Supabase storage is added.
- **Backend API** ([`server/`](server/README.md)): Node.js + Express + TypeScript with SSRF-safe target validation and the security engine (SSL/TLS, headers, DNS, email and gated exposure checks).

## Screens

| Route | Screen | What it shows |
| --- | --- | --- |
| `/` | Landing page | Hero with scan box, the six modules, how it works, sample finding, audiences, safeguards |
| `/scan` | Scan in progress | Live step-by-step progress, scan log, completion card |
| `/dashboard` | Dashboard | Results summary (no vanity score), critical findings, changes since last scan, results by module, websites, scan history |
| `/report` | Assessment report | Findings filterable by result and module; each opens to *what we found*, *why it matters*, *recommended action* and *evidence* |
| `/login` | Sign in | Email + password, generic errors, cool-down after repeated failures |
| `/signup` | Create account | Password strength meter, confirmation email, acceptable-use agreement |
| `/forgot-password`, `/reset-password` | Password reset | Secure email link; signs out every session after the change |

**Running both together:** start the API (`cd server && npm run dev`) and the frontend (`npm run dev`) in two terminals. `VITE_API_URL` in `.env.local` tells the frontend where the API is (default `http://localhost:4000`).

`/scan`, `/dashboard` and `/report` require sign-in. The API also verifies the session token, so the UI guard is not the only protection.

## What WebExpoSyn checks

1. **SSL/TLS:** HTTPS enabled, certificate validity, expiry, domain match, supported TLS versions
2. **HTTP security headers:** CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
3. **DNS security:** records, nameservers, CAA, DNSSEC, inconsistent configuration
4. **Email security:** SPF presence and syntax, DMARC policy, DKIM (when a selector is supplied), spoofing weaknesses
5. **Website exposure:** sensitive files, directory listings, public staging environments, server information disclosure (carefully controlled requests only)
6. **Reports & monitoring:** findings by severity, scan comparison, fix tracking, downloadable reports

## Features (frontend)

- Responsive on every screen size: mobile slide-in menus, stacking layouts, scrollable tables
- Load-in animations and scroll animations that slide items in and out (CSS scroll-driven animations with an IntersectionObserver fallback)
- Hero background that stays fixed while content scrolls
- Accessible markup: real buttons and links, labelled inputs, `aria-expanded` and `aria-pressed`, and support for `prefers-reduced-motion`
- shadcn/ui-compatible setup (`components.json`, `cn()` helper, `cva` button variants)

## Tech stack

| Technology | Purpose |
| --- | --- |
| React 19 + Vite 6 | Frontend framework and build tool |
| TypeScript | Type safety |
| Tailwind CSS v4 | Styling (design tokens in `src/index.css`) |
| React Router 7 | Routing |
| lucide-react | Icons |
| shadcn/ui conventions | Component patterns |

**Backend:** Node.js + Express 5 + TypeScript, zod validation, helmet, express-rate-limit, Node `tls` and `dns` for the security engine, vitest + supertest for tests.

**Planned:** Supabase PostgreSQL and Supabase Auth, hosting on Cloudflare Pages, Netlify or Vercel (frontend) and Render, Railway or Fly (API).

## Getting started

### Frontend

```bash
npm install
cp .env.example .env.local   # add your Supabase URL and anon key
npm run dev          # http://localhost:5173
npm run build        # production build
```

### Backend API

```bash
cd server
cp .env.example .env # set VERIFICATION_SECRET + SUPABASE_URL
npm install
npm run dev          # http://localhost:4000
npm test             # 89 tests, no network needed
npm run scan -- yourdomain.com   # scan from the terminal
```

Requires Node.js 20 or newer. See [server/README.md](server/README.md) for the API reference and safety controls.

## Project structure

```
server/                  # Express API + security engine (see server/README.md)
src/
├── assets/              # Logo, background images, module illustrations
├── components/
│   ├── landing/         # SiteHeader, Hero, Sections (modules, how it works…), SiteFooter
│   ├── layout/          # Logo, AppHeader
│   └── ui/              # Button (cva variants), Severity/Status badges
├── data/mock.ts         # Sample assessment data. Replace with API calls
├── hooks/               # useScrollReveal (scroll animation fallback)
├── lib/                 # cn() helper, status/severity styles
├── pages/               # Landing, Scan, Dashboard, Report, NotFound
├── types/               # Finding, Severity, CheckStatus, ModuleSummary…
├── App.tsx              # Routes
├── index.css            # Tailwind theme tokens + animations
└── main.tsx
```

## Brand

| Colour | Hex | Use |
| --- | --- | --- |
| Navy | `#091540` | Base background |
| Royal blue | `#1B2CC1` | Primary buttons, active states |
| Periwinkle | `#7692FF` | Accents, labels |
| Sky | `#ABD2FA` | Body text on dark, highlights |

Status colours (pass `#4ADE9A`, fail `#FF8F80`, warning `#F5C451`, high `#FFB27A`) sit alongside the brand palette.

Fonts: **Space Grotesk** (headings), **Inter** (body), **JetBrains Mono** (evidence and code).

## Security

See [SECURITY.md](SECURITY.md) for the latest security audit, the fixes applied, recommended Supabase settings and how to report a vulnerability.

## Security principles for the scanner

These are requirements, not options, for building a responsible security product:

- Block private, loopback and link-local IP addresses
- Validate DNS resolutions and every redirect
- Restrict protocols to HTTP and HTTPS, and prevent arbitrary ports
- Apply request timeouts and response-size limits
- Require domain ownership verification for deeper assessments
- Rate-limit scan requests
- Never execute submitted website content or files

## Roadmap

- [x] UI design and frontend screens
- [x] Express + TypeScript API with SSRF-safe URL validation
- [x] Security engine: TLS, headers, DNS, email checks
- [x] Controlled exposure checks behind ownership verification (DNS TXT)
- [x] Connect the Scan, Dashboard and Report screens to the API (real results, verification flow, report download)
- [x] Login, sign-up and password reset (Supabase Auth) + API token verification
- [x] Security audit (OWASP Top 10:2025) and fixes
- [ ] Supabase persistence (domains, findings, reports) with Row Level Security
- [ ] PDF report generation and scheduled monitoring

## Credits

Background photography supplied by the project owner (Pixabay / Pexels). Module illustrations were drawn for this project.

---

Built by **Elijah (Adedayo) Adeyeye**.
