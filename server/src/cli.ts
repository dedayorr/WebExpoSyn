/**
 * Run a scan from the terminal and print a readable summary.
 *   npm run scan -- example.com
 *   npm run scan -- example.com --json
 *   npm run scan -- example.com --dkim=google
 */
import { TargetValidationError } from './lib/target.js'
import { runScan } from './services/scan.js'

const args = process.argv.slice(2)
const url = args.find((a) => !a.startsWith('--'))
const json = args.includes('--json')
const dkim = args.find((a) => a.startsWith('--dkim='))?.slice(7).split(',')

if (!url) {
  console.error('Usage: npm run scan -- <domain or url> [--json] [--dkim=selector1,selector2]')
  process.exit(1)
}

const icons = { pass: '✓', fail: '✗', warn: '!', unverified: '?' } as const

try {
  const report = await runScan(url, { dkimSelectors: dkim })
  if (json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    const s = report.summary
    console.log(`\n${report.target.hostname} (${report.target.addresses.join(', ')}) in ${(report.durationMs / 1000).toFixed(1)}s`)
    console.log(`Ownership verified: ${report.ownershipVerified ? 'yes' : 'no'}`)
    console.log(`${s.total} checks: ${s.pass} passed, ${s.fail} failed, ${s.warn} warnings, ${s.unverified} not verified\n`)
    for (const finding of report.findings) {
      const sev = finding.severity === 'none' ? '' : ` [${finding.severity}]`
      console.log(`${icons[finding.status]} ${finding.module.padEnd(8)} ${finding.title}${sev}`)
    }
    console.log('')
  }
} catch (err) {
  if (err instanceof TargetValidationError) {
    console.error(`Rejected: ${err.message} (${err.code})`)
  } else {
    console.error(err)
  }
  process.exit(1)
}
