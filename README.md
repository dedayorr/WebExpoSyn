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

This repository contains the **frontend** (React + TypeScript + Vite + Tailwind CSS). It currently runs on sample data so the UI can be developed before the scanning backend exists.

## Screens

| Route | Screen | What it shows |
| --- | --- | --- |
| `/` | Landing page | Hero with scan box, the six modules, how it works, sample finding, audiences, safeguards |
| `/scan` | Scan in progress | Live step-by-step progress, scan log, completion card |
| `/dashboard` | Dashboard | Results summary (no vanity score), critical findings, changes since last scan, results by module, websites, scan history |
| `/report` | Assessment report | Findings filterable by result and module; each opens to *what we found*, *why it matters*, *recommended action* and *evidence* |

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

**Planned:** Node.js + Express + TypeScript backend (scan orchestration, validation, auth), Supabase PostgreSQL and Supabase Auth, OpenSSL and Node.js `dns` for the security engine, hosting on Cloudflare Pages, Netlify or Vercel.

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server (http://localhost:5173)
npm run dev

# 3. Production build
npm run build
npm run preview
```

Requires Node.js 18 or newer.

## Project structure

```
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

## Security principles for the scanner (backend roadmap)

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
- [ ] Express + TypeScript API with SSRF-safe URL validation
- [ ] Security engine: TLS, headers, DNS, email checks
- [ ] Controlled exposure checks behind ownership verification
- [ ] Supabase auth and persistence (users, domains, findings, reports)
- [ ] PDF report generation and scheduled monitoring

## Credits

Background photography supplied by the project owner (Pixabay / Pexels). Module illustrations were drawn for this project.

---

Built by **Elijah (Adedayo) Adeyeye**.
