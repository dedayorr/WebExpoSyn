import type { ModuleId } from '@/types'

/**
 * Plain-English explanations for people who are not technical: what each
 * check means, an everyday comparison, and a jargon buster for terms that
 * appear in results. Keep sentences short and free of acronyms.
 */
export interface ModulePlain {
  /** What the check is about, in everyday words. */
  plainName: string
  /** One line for small spaces (dashboard cards, scan steps). */
  short: string
  /** Two or three sentences. */
  what: string
  /** "Think of it like…" */
  analogy: string
}

export const MODULE_PLAIN: Record<ModuleId, ModulePlain> = {
  tls: {
    plainName: 'The padlock and a private connection',
    short: 'Is the padlock working, so what visitors type stays private?',
    what: 'This checks the padlock next to your web address. It makes sure anything visitors type on your site, such as passwords, card details or messages, is scrambled so nobody in between can read or change it, and that your site’s digital ID is valid and not expired.',
    analogy: 'Sending a letter in a sealed envelope instead of on a postcard anyone can read.',
  },
  headers: {
    plainName: 'Safety instructions for visitors’ browsers',
    short: 'Does your site tell browsers how to protect your visitors?',
    what: 'Every time someone opens your site, it can quietly send their browser a set of safety instructions: block harmful code, don’t let other sites copy your pages into theirs, and always use the secure version. Missing instructions leave visitors less protected.',
    analogy: 'House rules on the gate: “no strangers inside, always lock the door behind you.”',
  },
  dns: {
    plainName: 'Your domain’s address book',
    short: 'Does your web address point to the right place, safely?',
    what: 'The internet uses an address book to turn your website name into the location of your server. This checks those entries are set up correctly, kept in more than one place, and protected so nobody can secretly change them to send your visitors elsewhere.',
    analogy: 'Making sure your shop’s address on the map is correct, and that nobody can quietly move the pin to a fake shop.',
  },
  email: {
    plainName: 'Protection against fake emails in your name',
    short: 'Can scammers send emails that look like they come from you?',
    what: 'Scammers often send fake invoices or payment requests that look like they come from a real business. This checks the settings that let email providers like Gmail and Outlook spot those fakes and send them to spam or block them.',
    analogy: 'Registering your official company stamp so the post office can reject letters with a forged one.',
  },
  exposure: {
    plainName: 'Things accidentally left open to the public',
    short: 'Is anything private sitting where anyone can open it?',
    what: 'This looks for files and pages that should be private but anyone on the internet can open: backups, files with passwords, test copies of your site, or details about the software your server runs.',
    analogy: 'Checking you haven’t left the back door open or the spare key under the doormat.',
  },
}

export interface GlossaryTerm {
  term: string
  plain: string
  /** Case-insensitive patterns that mean this term appears in a result. */
  match: RegExp[]
}

export const GLOSSARY: GlossaryTerm[] = [
  { term: 'SSL / TLS', plain: 'The technology behind the padlock: it scrambles information travelling between a visitor and your website.', match: [/\bssl\b/i, /\btls\b/i] },
  { term: 'HTTPS', plain: 'The secure version of a web address, the one that shows a padlock.', match: [/\bhttps\b/i] },
  { term: 'Certificate', plain: 'Your website’s digital ID card, issued by a trusted company. It proves the site is really yours and must be renewed before it expires.', match: [/certificate/i] },
  { term: 'HSTS', plain: 'An instruction telling browsers to always use the secure, padlocked version of your site, even if someone types the address without it.', match: [/\bhsts\b/i, /strict-transport-security/i] },
  { term: 'Content-Security-Policy (CSP)', plain: 'A list of approved places your site may load code from. It blocks harmful code that sneaks onto a page.', match: [/content-security-policy/i, /\bcsp\b/i] },
  { term: 'Clickjacking protection', plain: 'Stops other websites from showing your pages inside theirs to trick visitors into clicking things.', match: [/x-frame-options/i, /clickjacking/i, /\bfram(e|ing)\b/i] },
  { term: 'Referrer-Policy', plain: 'Controls how much of your page address is shared with other sites when visitors click a link.', match: [/referrer/i] },
  { term: 'Permissions-Policy', plain: 'Switches off features you don’t use, such as camera or location, so nothing on your site can ask visitors for them.', match: [/permissions-policy/i] },
  { term: 'X-Content-Type-Options', plain: 'Stops browsers from guessing what kind of file something is, a trick attackers can abuse.', match: [/x-content-type-options/i, /nosniff/i] },
  { term: 'DNS', plain: 'The internet’s address book: it turns your website name into the location of your server.', match: [/\bdns\b/i] },
  { term: 'Nameserver', plain: 'The computers that hold your domain’s address book entries. Having two or more keeps your site working if one fails.', match: [/nameserver/i] },
  { term: 'DNSSEC', plain: 'A tamper-proof seal on your address book entries, so nobody can forge them.', match: [/dnssec/i] },
  { term: 'CAA record', plain: 'A setting that lists which companies are allowed to issue security certificates (digital ID cards) for your domain.', match: [/\bcaa\b/i] },
  { term: 'SPF', plain: 'A list of the email servers allowed to send email on behalf of your domain.', match: [/\bspf\b/i] },
  { term: 'DKIM', plain: 'A digital signature added to your emails so receivers can tell they are genuine and haven’t been changed.', match: [/\bdkim\b/i] },
  { term: 'DMARC', plain: 'Your instruction to email providers about emails that fail the checks: let them through, send them to spam, or block them.', match: [/\bdmarc\b/i] },
  { term: 'Directory listing', plain: 'A page that shows every file in a folder, like leaving a filing cabinet open for anyone to browse.', match: [/directory listing/i] },
  { term: '.env file', plain: 'A settings file that usually holds passwords and secret keys. It should never be public.', match: [/\.env\b/i] },
  { term: 'Server version', plain: 'Your server announcing the exact software it runs, which helps attackers look up known weaknesses.', match: [/server version/i, /server header/i, /\bnginx\b/i, /\bapache\b/i] },
  { term: 'Staging site', plain: 'A test copy of your website. These are often outdated and less protected than the real one.', match: [/staging/i, /\bdev(elopment)? (site|environment)/i] },
  { term: 'TXT record', plain: 'A short note stored in your domain’s address book, used to prove you own the domain or to set email rules.', match: [/\btxt record\b/i] },
  { term: 'Redirect', plain: 'Automatically sending visitors from one address to another, for example from the insecure to the secure version.', match: [/redirect/i] },
]

/** Glossary terms mentioned in any of the given texts, in glossary order. */
export function termsIn(...texts: string[]): GlossaryTerm[] {
  const text = texts.join(' \n ')
  return GLOSSARY.filter((g) => g.match.some((re) => re.test(text)))
}
