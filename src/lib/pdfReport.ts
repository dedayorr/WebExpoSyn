import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { CheckStatus, Finding, ScanReport, Severity } from '@/types'

/**
 * Builds a clean, printable A4 PDF of a scan report:
 *   1. header with the website and scan details
 *   2. results at a glance (no single score) and results by module
 *   3. issues to fix, most severe first, each with what / why / fix / evidence
 *   4. checks that couldn't be verified, then passed checks
 * Every page has a footer with the site, date and page number.
 */

const MODULE_LABELS: Record<Finding['module'], string> = {
  tls: 'SSL/TLS',
  headers: 'HTTP headers',
  dns: 'DNS security',
  email: 'Email security',
  exposure: 'Website exposure',
}
const STATUS_LABEL: Record<CheckStatus, string> = { pass: 'Passed', fail: 'Failed', warn: 'Warning', unverified: "Couldn't verify" }
const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4, none: 5 }

type RGB = [number, number, number]
const C = {
  navy: [9, 21, 64] as RGB,
  royal: [27, 44, 193] as RGB,
  sky: [171, 210, 250] as RGB,
  ink: [26, 35, 64] as RGB,
  muted: [91, 103, 133] as RGB,
  line: [221, 227, 240] as RGB,
  panel: [244, 247, 253] as RGB,
  pass: [31, 158, 99] as RGB,
  fail: [214, 64, 69] as RGB,
  warn: [196, 140, 18] as RGB,
}
const SEVERITY_COLOR: Record<Severity, RGB> = {
  critical: [214, 64, 69],
  high: [232, 125, 49],
  medium: [214, 160, 25],
  low: [90, 120, 230],
  info: [130, 142, 172],
  none: [31, 158, 99],
}

const PAGE_W = 210
const PAGE_H = 297
const M = 16 // margin
const CONTENT_W = PAGE_W - M * 2
const FOOTER_SPACE = 16

/**
 * The PDF's built-in fonts only cover Western European characters. Replace
 * common symbols and drop anything else so nothing prints as garbage.
 */
const CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
export function pdfSafe(text: string): string {
  return text
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/[✓✔]/g, 'OK')
    .replace(/[✗✘]/g, 'x')
    .replace(/ /g, ' ')
    .replace(/./gu, (ch) => {
      const code = ch.codePointAt(0)!
      if (code === 10 || code === 9 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255) || CP1252_EXTRA.includes(ch)) return ch
      return '?'
    })
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export interface PdfOptions {
  /** PNG data URL of the logo icon, drawn in the header. */
  logoDataUrl?: string
}

export function buildReportPdf(report: ScanReport, opts: PdfOptions = {}): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.setProperties({
    title: `WebExpoSyn report: ${report.target.hostname}`,
    subject: 'Website security assessment',
    author: 'WebExpoSyn',
    creator: 'WebExpoSyn',
  })
  let y = 0

  const color = (rgb: RGB, kind: 'text' | 'fill' | 'draw' = 'text') => {
    if (kind === 'text') doc.setTextColor(...rgb)
    else if (kind === 'fill') doc.setFillColor(...rgb)
    else doc.setDrawColor(...rgb)
  }
  const font = (size: number, style: 'normal' | 'bold' = 'normal', family: 'helvetica' | 'courier' = 'helvetica') => {
    doc.setFont(family, style)
    doc.setFontSize(size)
  }
  const lines = (text: string, width: number) => doc.splitTextToSize(pdfSafe(text), width) as string[]
  const lineH = (size: number) => size * 0.3528 * 1.35 // pt -> mm with leading
  const ensure = (height: number) => {
    if (y + height > PAGE_H - FOOTER_SPACE) {
      doc.addPage()
      y = M
    }
  }
  /** keepWith: space the content after the heading needs, so a heading never sits alone at a page bottom. */
  const heading = (text: string, sub?: string, keepWith = 0) => {
    ensure(18 + keepWith)
    y += 4
    font(13, 'bold')
    color(C.navy)
    doc.text(pdfSafe(text), M, y)
    if (sub) {
      font(9)
      color(C.muted)
      doc.text(pdfSafe(sub), PAGE_W - M, y, { align: 'right' })
    }
    y += 2.5
    color(C.royal, 'draw')
    doc.setLineWidth(0.6)
    doc.line(M, y, M + 18, y)
    y += 6
  }

  /* ---------------- 1. Header ---------------- */
  color(C.navy, 'fill')
  doc.rect(0, 0, PAGE_W, 42, 'F')
  let textX = M
  if (opts.logoDataUrl) {
    try {
      doc.addImage(opts.logoDataUrl, 'PNG', M, 9, 20, 24)
      textX = M + 26
    } catch {
      /* draw without logo */
    }
  }
  font(9, 'bold')
  color(C.sky)
  doc.text('WEBEXPOSYN  ·  SECURITY ASSESSMENT REPORT', textX, 15)
  font(20, 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(lines(report.target.hostname, PAGE_W - textX - M)[0], textX, 25)
  font(9.5)
  color(C.sky)
  doc.text(pdfSafe(`Assessed ${fmtDate(report.completedAt)}`), textX, 32)
  y = 52

  // Scan details
  const details: [string, string][] = [
    ['Website', report.target.hostname],
    ['Address scanned', report.target.url],
    ['IP addresses', report.target.addresses.join(', ') || 'n/a'],
    ['Domain', report.target.domain],
    ['Duration', `${(report.durationMs / 1000).toFixed(1)} seconds`],
    ['Ownership', report.ownershipVerified ? 'Verified (exposure checks included)' : 'Not verified (exposure checks not run)'],
  ]
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    body: details.map(([k, v]) => [pdfSafe(k), pdfSafe(v)]),
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: { top: 1.6, bottom: 1.6, left: 0, right: 2 }, textColor: C.ink },
    columnStyles: { 0: { cellWidth: 38, textColor: C.muted, fontStyle: 'bold' } },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

  /* ---------------- 2. At a glance ---------------- */
  heading('Results at a glance')
  const s = report.summary
  const boxes: [string, number, RGB][] = [
    ['Checks tested', s.total, C.navy],
    ['Passed', s.pass, C.pass],
    ['Failed', s.fail, C.fail],
    ['Warnings', s.warn, C.warn],
    ["Couldn't verify", s.unverified, C.muted],
  ]
  const gap = 3
  const boxW = (CONTENT_W - gap * (boxes.length - 1)) / boxes.length
  boxes.forEach(([label, value, rgb], i) => {
    const x = M + i * (boxW + gap)
    color(C.panel, 'fill')
    color(C.line, 'draw')
    doc.setLineWidth(0.2)
    doc.roundedRect(x, y, boxW, 20, 2, 2, 'FD')
    font(17, 'bold')
    color(rgb)
    doc.text(String(value), x + 4, y + 10)
    font(8)
    color(C.muted)
    doc.text(pdfSafe(label), x + 4, y + 16)
  })
  y += 26
  font(9.5)
  color(C.ink)
  const sev = s.bySeverity
  doc.text(pdfSafe(`Issues by severity:  Critical ${sev.critical}   ·   High ${sev.high}   ·   Medium ${sev.medium}   ·   Low ${sev.low}`), M, y)
  y += 5.5
  font(8.5)
  color(C.muted)
  for (const l of lines(
    'WebExpoSyn does not give a single "percent secure" score. Every check is listed with its result and evidence. "Couldn\'t verify" means a check needed more information or could not finish, and it is never counted as a pass.',
    CONTENT_W,
  )) {
    doc.text(l, M, y)
    y += lineH(8.5)
  }
  y += 4

  heading('Results by module', undefined, 45)
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: FOOTER_SPACE },
    head: [['Module', 'Checks', 'Passed', 'Failed', 'Warnings', "Couldn't verify"]],
    body: report.modules.map((m) => [
      pdfSafe(m.name + (m.error ? ' (incomplete)' : '')),
      String(m.pass + m.fail + m.warn + m.unverified),
      String(m.pass),
      String(m.fail),
      String(m.warn),
      String(m.unverified),
    ]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2, textColor: C.ink, lineColor: C.line, lineWidth: 0.2 },
    headStyles: { fillColor: C.navy, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold' }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' } },
    alternateRowStyles: { fillColor: C.panel },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  /* ---------------- 3. Issues ---------------- */
  const issues = report.findings
    .filter((f) => f.status === 'fail' || f.status === 'warn')
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  const block = (f: Finding, compact = false) => {
    const textW = CONTENT_W - 8
    const sections: [string, string][] = compact
      ? [
          ['What we found', f.found],
          ['What to do', f.action],
        ]
      : [
          ['What we found', f.found],
          ['Why it matters', f.why],
          ['Recommended action', f.action],
        ]
    font(9.5) // measure with the same font size the text is drawn in
    const wrapped = sections.map(([label, text]) => [label, lines(text, textW)] as const)
    font(8, 'normal', 'courier')
    const ev = compact || !f.evidence ? [] : lines(f.evidence, textW - 6).slice(0, 10)
    font(11, 'bold')
    const titleLines = lines(f.title, textW - 30)
    const height =
      8 + titleLines.length * lineH(11) + 5 + wrapped.reduce((h, [, l]) => h + 4.5 + l.length * lineH(9.5) + 2, 0) + (ev.length ? 6 + ev.length * lineH(8) + 4 : 0) + 4

    ensure(Math.min(height, PAGE_H - FOOTER_SPACE - M))
    const top = y
    // card
    color([255, 255, 255], 'fill')
    color(C.line, 'draw')
    doc.setLineWidth(0.25)
    doc.roundedRect(M, top, CONTENT_W, height, 2, 2, 'FD')
    color(SEVERITY_COLOR[f.severity], 'fill')
    doc.rect(M, top, 1.6, height, 'F') // severity stripe

    // severity chip
    const chip = f.severity === 'none' ? 'PASS' : f.severity.toUpperCase()
    font(7.5, 'bold')
    const chipW = doc.getTextWidth(chip) + 5
    color(SEVERITY_COLOR[f.severity], 'fill')
    doc.roundedRect(PAGE_W - M - 4 - chipW, top + 4, chipW, 5.5, 1.2, 1.2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.text(chip, PAGE_W - M - 4 - chipW / 2, top + 7.8, { align: 'center' })

    y = top + 8.5
    font(11, 'bold')
    color(C.navy)
    for (const l of titleLines) {
      doc.text(l, M + 5, y)
      y += lineH(11)
    }
    font(8.5)
    color(C.muted)
    doc.text(pdfSafe(`${MODULE_LABELS[f.module]}  ·  ${STATUS_LABEL[f.status]}  ·  Confidence: ${f.confidence}`), M + 5, y)
    y += 5
    for (const [label, l] of wrapped) {
      font(7.5, 'bold')
      color(C.royal)
      doc.text(label.toUpperCase(), M + 5, y)
      y += 4.5
      font(9.5)
      color(C.ink)
      for (const line of l) {
        if (y > PAGE_H - FOOTER_SPACE) {
          doc.addPage()
          y = M + 4
        }
        doc.text(line, M + 5, y)
        y += lineH(9.5)
      }
      y += 2
    }
    if (ev.length) {
      font(7.5, 'bold')
      color(C.royal)
      doc.text('EVIDENCE', M + 5, y)
      y += 2
      const evH = ev.length * lineH(8) + 4
      color(C.panel, 'fill')
      doc.roundedRect(M + 5, y, textW, evH, 1.5, 1.5, 'F')
      font(8, 'normal', 'courier')
      color(C.ink)
      let ey = y + 4
      for (const line of ev) {
        doc.text(line, M + 8, ey)
        ey += lineH(8)
      }
      y += evH + 2
    }
    y = Math.max(y, top + height) + 4
  }

  heading('Issues to fix', issues.length ? `${issues.length} found, most severe first` : undefined, issues.length ? 70 : 10)
  if (!issues.length) {
    font(10)
    color(C.pass)
    doc.text('No failed checks or warnings. Keep scanning regularly to catch changes.', M, y)
    y += 8
  } else {
    issues.forEach((f) => block(f))
  }

  /* ---------------- 4. Couldn't verify + passed ---------------- */
  const unverified = report.findings.filter((f) => f.status === 'unverified')
  if (unverified.length) {
    heading("Couldn't verify", 'Not counted as passes', 45)
    unverified.forEach((f) => block(f, true))
  }

  const passed = report.findings.filter((f) => f.status === 'pass')
  if (passed.length) {
    heading('Passed checks', `${passed.length} checks`, 30)
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: FOOTER_SPACE, top: M },
      head: [['Check', 'Module', 'Result']],
      body: passed.map((f) => [pdfSafe(f.title), MODULE_LABELS[f.module], 'Passed']),
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2, textColor: C.ink, lineColor: C.line, lineWidth: 0.2 },
      headStyles: { fillColor: C.navy, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 1: { cellWidth: 38 }, 2: { cellWidth: 22, textColor: C.pass, fontStyle: 'bold' } },
      alternateRowStyles: { fillColor: C.panel },
    })
  }

  /* ---------------- Footer on every page ---------------- */
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    color(C.line, 'draw')
    doc.setLineWidth(0.2)
    doc.line(M, PAGE_H - 11, PAGE_W - M, PAGE_H - 11)
    font(8)
    color(C.muted)
    doc.text(pdfSafe(`WebExpoSyn  ·  ${report.target.hostname}  ·  ${fmtDate(report.completedAt)}`), M, PAGE_H - 6.5)
    doc.text(`Page ${i} of ${pages}`, PAGE_W - M, PAGE_H - 6.5, { align: 'right' })
  }

  return doc
}

export function reportPdfFilename(report: ScanReport) {
  const safeHost = report.target.hostname.replace(/[^a-z0-9.-]/gi, '_')
  return `WebExpoSyn-${safeHost}-${report.completedAt.slice(0, 10)}.pdf`
}
