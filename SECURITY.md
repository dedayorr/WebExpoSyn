# Security

## Reporting a vulnerability

Please do **not** open a public issue. Email the maintainer or use GitHub's private vulnerability reporting (Security tab → Report a vulnerability). Include steps to reproduce and the impact. You'll get a response within 5 working days.

---

## Security audit: 21 Nov 2026

**Scope:** `server/` (Express API and scanning engine) and the React frontend at the repo root, at commit `680b5a9`.
**Method:** Static review against the OWASP Top 10:2025, plus the project's own unit tests and `npm audit`. No live or penetration testing; the deployed configuration was not available.
**Result:** 8 issues found, all fixed in this change. 0 known dependency vulnerabilities after the upgrades.

| ID | Issue | Severity | Confidence | Status |
| --- | --- | --- | --- | --- |
| OWASP-A07-001 | Scan and verification API had no authentication | Medium | High | Fixed |
| OWASP-A06-001 | Scanner could be aimed repeatedly at a third-party site | Medium | High | Fixed |
| OWASP-A06-002 | Unbounded DNS work from attacker-controlled SPF include trees | Medium | High | Fixed |
| OWASP-A03-001 | Vulnerable dependencies (`zod` high; `vitest`/`tinypool` dev-only critical) | Medium | High | Fixed |
| OWASP-A10-001 | Overall scan timeout not enforced; first DNS lookup could hang | Low | High | Fixed |
| OWASP-A01-001 | Exposure evidence could include the start of leaked secrets | Low | High | Fixed |
| OWASP-A04-001 | Built-in fallback verification secret used when `NODE_ENV` was unset | Low | High | Fixed |
| OWASP-A09-001 | No security event logging for scans, rejections or auth failures | Low | High | Fixed |
| Hardening | Frontend hosting config sent no security headers | Info | High | Fixed |

### OWASP-A07-001: Missing authentication for scans ([CWE-306](https://cwe.mitre.org/data/definitions/306.html))

`POST /api/scans` and the verification endpoints accepted anonymous requests, so anyone could use the service to probe sites, limited only by per-IP rate limits.
**Fix:** `server/src/middleware/auth.ts` verifies Supabase access tokens locally. It pins the algorithm (ES256/RS256 via JWKS, or HS256 for legacy projects; rejects `alg: none`) and enforces issuer, audience `authenticated`, expiry and subject. The server refuses to start without `SUPABASE_URL` unless it is explicitly in development with `AUTH_MODE=disabled`. Rate limits are now keyed per user. Tests: `tests/auth.test.ts` and `tests/app.test.ts`.

### OWASP-A06-001: Third-party targeting ([CWE-799](https://cwe.mitre.org/data/definitions/799.html))

Rate limiting was per client only. Many accounts or IPs could direct repeated scans (TLS handshakes, HTTP requests) at one victim site.
**Fix:** `lib/targetThrottle.ts` caps scans of any single hostname across all users (default 3 per 10 minutes) and returns `429 TARGET_COOLDOWN` with `Retry-After`.

### OWASP-A06-002: SPF include fan-out (no exact mapped CWE; closest is CWE-400, which sits outside the 2025 mapping)

`countSpfLookups` limited depth but not breadth. An attacker-controlled SPF record whose includes each include 20 more could trigger thousands of DNS queries per scan.
**Fix:** A hard budget of 12 TXT queries per scan. Exceeding the RFC 7208 limit already means "fail", so stopping early gives the same answer. Test: `SPF lookup budget`.

### OWASP-A03-001: Vulnerable components ([CWE-1395](https://cwe.mitre.org/data/definitions/1395.html))

`npm audit` reported `zod` (high, a runtime dependency) and `vitest`/`tinypool`/`esbuild` (dev only, including critical).
**Fix:** Upgraded to `zod` 4, `vitest` 5 and `express-rate-limit` 8. Both packages now audit clean. `.github/dependabot.yml` opens weekly update PRs.

### OWASP-A10-001: Exceptional conditions not bounded ([CWE-755](https://cwe.mitre.org/data/definitions/755.html))

`SCAN_TIMEOUT_MS` was defined but never applied, and `dns.lookup` (getaddrinfo) has no built-in timeout, so a request could hang and hold a scanner slot indefinitely.
**Fix:** A 5 s lookup timeout, plus an overall scan timeout that returns `504`. The concurrency slot is held until the background work really ends, so timeouts can't be used to exceed the concurrency cap.

### OWASP-A01-001: Partial secret disclosure in reports ([CWE-200](https://cwe.mitre.org/data/definitions/200.html))

When a verified owner's site exposed `/.env` or similar, the evidence included the first 40 characters, which could contain a secret value. Reports can be downloaded and shared.
**Fix:** Each sensitive-file check now writes a safe description only (for example, variable names with values hidden, or the number of password-hash entries). Test: `exposure evidence redaction`.

### OWASP-A04-001: Fallback secret ([CWE-321](https://cwe.mitre.org/data/definitions/321.html))

If `NODE_ENV` was not set to `production`, the server silently used a committed default `VERIFICATION_SECRET`.
**Fix:** `NODE_ENV` now defaults to `production`, and a secret of at least 32 characters is mandatory outside tests. `CORS_ORIGINS="*"` is also refused.

### OWASP-A09-001: Insufficient logging ([CWE-778](https://cwe.mitre.org/data/definitions/778.html))

There was no record of who scanned what, rejected targets, rate-limit hits or failed authentication.
**Fix:** `lib/logger.ts` writes structured JSON events. Values are JSON-encoded, which prevents log injection, and no tokens or response bodies are logged.

### Frontend hardening

`public/_headers` (Netlify, Cloudflare Pages) and `vercel.json` now send a strict CSP (`script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), HSTS, nosniff, Referrer-Policy, Permissions-Policy and COOP. **Add your API origin to `connect-src` when you deploy it.**

### Controls verified as already in place

- **SSRF:** scheme and port allowlist, rejection of IP literals and internal names, every resolved address checked, sockets pinned to the validated IP, every redirect re-validated, timeouts and size limits (`lib/target.ts`, `lib/safeFetch.ts`).
- **Injection:** no shell, eval, SQL or template rendering of user input. React escapes all output, and no `dangerouslySetInnerHTML` is used.
- **Errors:** generic error responses with no stack traces. Zod validation on every request body, and a 10 KB body limit.
- **Headers:** helmet on the API, and CORS restricted to an exact origin list.

### New authentication screens: built-in protections

- **Open redirect:** `?next=` passes through `safeNext()`, which allows same-origin relative paths only.
- **Account enumeration:** sign-in shows one message for a wrong email or a wrong password. Sign-up and password reset show the same screen whether or not the account exists.
- **Passwords:** 10 to 128 characters, common words and the email name are blocked, and a strength meter is shown. Enable Supabase **leaked password protection** for breach checks.
- **Password reset:** only a recovery session from the email link can set a new password, and all sessions are signed out afterwards.
- **Brute force:** a client-side cool-down after 5 failures. Supabase rate-limits server-side; enable CAPTCHA in Supabase for stronger protection.
- **Tokens:** PKCE flow, so tokens are never placed in URL fragments.

### Update: frontend connected to the API

- API calls send the Supabase access token as a bearer token, with `credentials: 'omit'` (no cookies, so CSRF doesn't apply). An expired session leads to sign-out and a return to the login page.
- API responses are rendered as text through React, so scanned sites' headers or records can't inject HTML.
- Until Supabase storage is added, reports are kept in the browser's localStorage, per user, capped at 25, and **cleared on sign-out**. Anyone with access to the device or an XSS bug could read them, so the strict CSP matters. Moving reports to Supabase with Row Level Security is the next step.
- **Deploying:** add the API origin to `connect-src` in `public/_headers` / `vercel.json`, otherwise the browser will block scans.

### Update: saved history in Supabase

- **Who can write.** Only the API writes reports and verifications, using the server-only secret key (`SUPABASE_SECRET_KEY`), which bypasses RLS. That key must never reach the browser, git, chat or screenshots. The server refuses to start if a publishable key is put there by mistake.
- **Who can read.** RLS policies allow signed-in users to `select` and `delete` only rows where `user_id = auth.uid()`. There are no insert or update policies, and `anon` has no grants, so users cannot forge a clean report or mark a domain as verified.
- **Tested.** `server/tests/rls.test.ts` runs the real migration in embedded Postgres and checks 11 rules: cross-user reads and deletes, forging, editing, self-verification, anonymous access, tokens without a user id, cascade on account deletion and oversized reports.
- **Per-account verification.** Tokens are `HMAC(secret, userId + ":" + domain)`, which fixes the cross-account reuse noted earlier. Ownership is still re-checked in DNS on every scan, so a domain that changes hands stops being verified.
- **Bounded storage.** Reports are capped at 1 MB each and 200 per user.
- **Local fallback.** If saving fails, the API still returns the report, marked `persisted: false`, and the browser keeps it locally until sign-out.

### Update: subscriptions and the free-plan limit

- **The limit is enforced by the API, not the browser.** Before each scan the server reads the user's plan and the websites in their history. A new website beyond the free limit gets `402 PLAN_LIMIT`. Websites currently being scanned count too, so parallel requests can't slip past it. If the plan can't be read the scan is refused (fails closed).
- **Users can't make themselves Pro.** `subscriptions` has a select-own RLS policy only; `billing_events` has no user grants at all. `server/tests/rls.test.ts` checks that a user can't update, insert or read billing data they shouldn't.
- **Payments are verified with Paystack, server-side.** `/api/billing/verify` asks Paystack about the reference and accepts it only if it succeeded, is in NGN, is at least the Pro price, is for the Pro plan, and its metadata `user_id` matches the signed-in user (so one person's receipt can't upgrade another account). Old payments can't re-activate an expired plan.
- **Webhooks are authenticated.** The `x-paystack-signature` HMAC-SHA512 is checked against the raw body with a constant-time compare. Each event is recorded once (idempotency), so replays are ignored; events for a different subscription are ignored. Period ends only move forward.
- **Secret key stays on the server.** `PAYSTACK_SECRET_KEY` is server-only; the server refuses a public `pk_` key and warns if a test key runs in production. The browser only ever gets a checkout or manage link, and it only follows links to Paystack's own domains.

### Limitations

These were not assessable from the repository: the deployed hosting and proxy configuration (including `TRUST_PROXY`), the Supabase project settings, egress firewall rules on the API host, and runtime behaviour against real websites. Rate-limit and throttle state is in memory; use a shared store (for example Redis) if you run more than one API instance.

### Recommended Supabase settings

1. Authentication → Providers → Email: **Confirm email** on.
2. Authentication → Policies (Pro plan): **Leaked password protection** on, and minimum password length 10.
3. Authentication → Attack protection: enable **CAPTCHA** (hCaptcha or Cloudflare Turnstile).
4. Authentication → URL configuration: set the Site URL and add `/login` and `/reset-password` to the allowed redirect URLs. Do not use wildcards on production domains.
5. Run the migration in `supabase/migrations/`. It enables RLS on every table it creates; keep RLS on for any table you add later.
