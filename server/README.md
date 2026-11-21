# WebExpoSyn API

Node.js + Express + TypeScript backend for WebExpoSyn: scan orchestration, SSRF-safe target validation and the security engine.

## Quick start

```bash
cd server
cp .env.example .env      # set VERIFICATION_SECRET, SUPABASE_URL and SUPABASE_SECRET_KEY
                          # (or NODE_ENV=development + AUTH_MODE=disabled to try it without Supabase)
npm install
npm run dev               # http://localhost:4000
```

Scan from the terminal without starting the server:

```bash
npm run scan -- yourdomain.com
npm run scan -- yourdomain.com --dkim=google
npm run scan -- yourdomain.com --out=report.json   # clean JSON file
# The CLI has no signed-in user, so it never runs the ownership-gated exposure checks.
```

Run the tests:

```bash
npm test
```

## API

All routes except `/api/health` require `Authorization: Bearer <Supabase access token>`.

| Method | Route | Body | Returns |
| --- | --- | --- | --- |
| `GET` | `/api/health` | | `{ status }` |
| `POST` | `/api/scans` | `{ url, dkimSelectors? }` | Full `ScanReport` (see `src/types.ts`), saved to the user's history; `persisted` says whether saving worked |
| `GET` | `/api/verification/:domain` | | TXT record the signed-in user must add (unique per account) |
| `POST` | `/api/verification/check` | `{ domain }` | `{ domain, verified }`; records the verification on success |

Errors always use `{ error: { code, message } }`:

| Status | When |
| --- | --- |
| `400` | Invalid request body |
| `401` | Missing, expired or invalid session token |
| `422` | Target rejected (internal host, private IP, bad port…); `code` says why |
| `429` | Rate limit hit (`RATE_LIMITED`) or the target was scanned recently (`TARGET_COOLDOWN`) |
| `504` | Scan exceeded `SCAN_TIMEOUT_MS` |
| `503` | Too many scans running at once |

Example:

```bash
curl -X POST http://localhost:4000/api/scans \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","dkimSelectors":["google"]}'
```

## How a scan works

1. **Validate** the URL in `lib/target.ts`. It must be http/https on port 80 or 443, with no credentials, no IP literals and no internal hostnames (`localhost`, `.local`, `.internal`…), and the domain must be public (checked against the Public Suffix List).
2. **Resolve and check every address.** If any A/AAAA record is private, loopback, link-local (including cloud metadata `169.254.169.254`), CGNAT, multicast or reserved, the scan is refused.
3. **Check ownership.** A DNS TXT record (`webexposyn-verify=…`) unlocks the exposure module.
4. **Run the modules in parallel**, each with a time budget. A module that fails or times out is reported as *couldn't verify*, never as a pass.
5. **Build the report.** Every finding carries status, severity, confidence, what we found, why it matters, the recommended action and evidence.

### Modules

| Module | File | Checks |
| --- | --- | --- |
| SSL/TLS | `checks/tls.ts` | HTTPS available, trusted chain, hostname match, expiry, TLS 1.0/1.1 disabled, TLS 1.3 support, HTTP→HTTPS redirect |
| HTTP headers | `checks/headers.ts` | CSP (incl. unsafe sources), HSTS (incl. max-age), X-Content-Type-Options, clickjacking (XFO or frame-ancestors), Referrer-Policy, Permissions-Policy |
| DNS | `checks/dns.ts` | Nameserver count, nameserver consistency (SOA serials), CAA, DNSSEC (via DNS-over-HTTPS), dangling CNAMEs |
| Email | `checks/email.ts` | SPF presence/syntax/qualifier, 10-lookup limit, multiple records, ptr; DMARC policy, pct, reporting; DKIM by supplied or common selectors |
| Exposure | `checks/exposure.ts` + `headers.ts` | Server version disclosure (always). Sensitive files, directory listings and public staging sites run **only for verified owners** |

## Safety controls

These are enforced in code, not just documented:

- **SSRF protection.** Every URL, including each redirect hop, goes through `parseTarget` + `resolvePublicAddresses`.
- **DNS pinning.** Sockets connect to the address that was validated, which defeats DNS rebinding between check and use.
- **Manual redirects**, at most 5, each one re-validated.
- **Timeouts** (per request and per module) and **response-size limits**.
- **Authentication**: Supabase tokens verified locally with a pinned algorithm, issuer, audience and expiry. The server won't start without auth unless it's explicitly in development.
- **Rate limiting**: 10 scans per user (or IP) per 15 minutes by default, plus a concurrency cap.
- **Per-target throttle**: any one hostname can be scanned at most 3 times per 10 minutes across all users, so the scanner can't be turned against a third party.
- **Bounded work**: overall scan timeout (`504`), DNS lookup timeout, and a 12-query budget when walking SPF includes.
- **Fail-closed config**: a verification secret of at least 32 characters is required, `NODE_ENV` defaults to production, and `CORS_ORIGINS="*"` is refused.
- **Saved history**: reports are written only by the API with the server-side secret key. Users read and delete their own rows through Row Level Security and cannot insert, edit or self-verify (`tests/rls.test.ts` runs the real migration in embedded Postgres). History is capped at 200 scans per user.
- **Per-account verification**: TXT tokens are an HMAC of user id + domain, so one user's verification never unlocks exposure checks for another.
- **Security event log**: JSON lines for scans, rejected targets, rate limits and failed auth (no tokens or bodies).
- **Controlled exposure checks.** A fixed list of 8 files, 4 folders and 4 subdomains, matched by content signature to avoid soft-404 false positives, with a delay between requests. Evidence is a safe description only (for example, variable names with values hidden), so reports never contain leaked secrets.
- **Nothing is executed.** Responses are only read as text.
- **No internals leak.** Errors return codes and friendly messages, never stack traces.
- **Hardened server.** `helmet`, a CORS allowlist and a 10 KB JSON body limit.

## Project layout

```
server/
├── src/
│   ├── app.ts                 # Express app, routes, error handling
│   ├── index.ts               # Starts the server
│   ├── cli.ts                 # `npm run scan -- domain`
│   ├── config.ts              # Env validation (zod)
│   ├── types.ts               # Report types (mirrors the frontend)
│   ├── lib/                   # target validation, safeFetch, ip, dns, doh, finding helpers
│   ├── checks/                # tls, headers, dns, email, exposure
│   └── services/              # scan orchestrator, ownership verification
└── tests/                     # vitest + supertest (no network needed)
```

## Next steps

- Move rate-limit and throttle state to Redis when running more than one instance
- Stream scan progress to the Scan screen (Server-Sent Events)
- PDF report generation and scheduled re-scans
