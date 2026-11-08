// Pure domain logic shared by the SpacetimeDB module (authoritative) and the gateway.
// No I/O, no Node APIs: this file is bundled into the module.

// ---------------------------------------------------------------------------
// Synthetic scenario fixtures (reserved .example domains only).
// ---------------------------------------------------------------------------
export const scenarios = {
  delivery: {channel: 'sms', text: 'USPS: Your package could not be delivered due to an incomplete address. Pay the $1.25 redelivery fee within 2 hours to avoid return: https://usps-redelivery.example.com/confirm'},
  variant: {channel: 'sms', text: 'USPS notice: parcel on hold. A small handling charge is required before release today. https://usps-parcelcare.example.com/pay'},
  bank: {channel: 'email', text: 'From: "Chase Security" <alerts@chase-secure-login.example.net>\nSubject: Unusual sign-in detected - action required\n\nWe detected a sign-in from a new device. Your account will be suspended within 24 hours unless you verify your identity: https://chase-secure-login.example.net/verify'},
  voice: {channel: 'call', text: 'Caller claimed to be Amazon support, said there was a fraudulent order, and urgently asked for the one-time verification code sent by text.'},
} as const;
export type Scenario = keyof typeof scenarios;

// ---------------------------------------------------------------------------
// Sources and channels
// ---------------------------------------------------------------------------
export const externalSources = {elevenlabs_call: 'call', photon_imessage: 'imessage', operator_report: 'report'} as const;
export type ExternalSource = keyof typeof externalSources;
export const EXTERNAL_EVENT_ID = /^(el|ph|rp)-[a-f0-9]{32}$/;
export const MAX_SUMMARY_LENGTH = 600;
export const MAX_REPORT_LENGTH = 4000;

// ---------------------------------------------------------------------------
// Sanitization: applied by the gateway and again inside reducers.
// ---------------------------------------------------------------------------
/** Strips query strings, redacts email local parts, phone numbers and long digit runs; caps length. */
export function sanitizeSummary(text: string, max = MAX_SUMMARY_LENGTH): string {
  return text
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ')
    .replace(/\b(https?:\/\/[^\s?#]+)[?#]\S*/gi, '$1')
    .replace(/\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi, '•••@$1')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[number]')
    .replace(/\d{4,}/g, '[number]')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

// ---------------------------------------------------------------------------
// Message parsing
// ---------------------------------------------------------------------------
export interface ParsedMessage {
  /** Short line for lists: email subject or the first sentence. */
  headline: string;
  /** Body text without header lines. */
  body: string;
  /** Domain of the From/Reply-To address, lowercased; '' if none. */
  senderDomain: string;
  replyToDomain: string;
  looksLikeEmail: boolean;
  /** Failed checks from an "Auth: spf=… dkim=… dmarc=…" line (written by email.compactEmail). */
  authFailures: string[];
}

/** Shortens at a word boundary and marks the cut. */
export function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.6)).trimEnd()}…`;
}

const HEADER = /^(from|to|subject|reply-to|date|sent|cc|auth):\s*(.*)$/i;
const domainOf = (s: string) => s.match(/@([a-z0-9.-]+\.[a-z]{2,})/i)?.[1]?.toLowerCase() ?? '';

export function parseMessage(raw: string): ParsedMessage {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const headers: Record<string, string> = {};
  let i = 0;
  for (; i < lines.length && i < 12; i++) {
    const m = lines[i].match(HEADER);
    if (!m) break;
    headers[m[1].toLowerCase()] = m[2].trim();
  }
  const looksLikeEmail = 'subject' in headers || 'from' in headers;
  const body = (looksLikeEmail ? lines.slice(i) : lines).join('\n').trim();
  const firstSentence = body.split(/(?<=[.!?])\s|\n/)[0]?.trim() ?? '';
  const headline = clip(headers.subject || firstSentence || body, 96);
  const authFailures = [...(headers.auth ?? '').matchAll(/\b(spf|dkim|dmarc)=(fail|softfail|permerror)\b/gi)]
    .map(([, check, result]) => `${check.toUpperCase()} ${result.toLowerCase()}`);
  return {headline, body, senderDomain: domainOf(headers.from ?? ''), replyToDomain: domainOf(headers['reply-to'] ?? ''), looksLikeEmail, authFailures};
}

// ---------------------------------------------------------------------------
// Brands commonly impersonated, with domains they actually use.
// ---------------------------------------------------------------------------
interface Brand { key: string; name: string; pattern: RegExp; domains: string[] }
const BRANDS: Brand[] = [
  {key: 'usps', name: 'USPS', pattern: /\busps\b|postal service/i, domains: ['usps.com']},
  {key: 'ups', name: 'UPS', pattern: /\bups\b/i, domains: ['ups.com']},
  {key: 'fedex', name: 'FedEx', pattern: /fed ?ex/i, domains: ['fedex.com']},
  {key: 'dhl', name: 'DHL', pattern: /\bdhl\b/i, domains: ['dhl.com']},
  {key: 'amazon', name: 'Amazon', pattern: /amazon/i, domains: ['amazon.com']},
  {key: 'paypal', name: 'PayPal', pattern: /pay ?pal/i, domains: ['paypal.com']},
  {key: 'apple', name: 'Apple', pattern: /\bapple\b|icloud/i, domains: ['apple.com', 'icloud.com']},
  {key: 'microsoft', name: 'Microsoft', pattern: /microsoft|outlook|office ?365/i, domains: ['microsoft.com', 'outlook.com', 'live.com']},
  {key: 'netflix', name: 'Netflix', pattern: /netflix/i, domains: ['netflix.com']},
  {key: 'chase', name: 'Chase', pattern: /\bchase\b/i, domains: ['chase.com']},
  {key: 'bofa', name: 'Bank of America', pattern: /bank of america|\bbofa\b/i, domains: ['bankofamerica.com']},
  {key: 'wells', name: 'Wells Fargo', pattern: /wells ?fargo/i, domains: ['wellsfargo.com']},
  {key: 'irs', name: 'IRS', pattern: /\birs\b|internal revenue/i, domains: ['irs.gov']},
  {key: 'ssa', name: 'Social Security', pattern: /social security (administration|number|office)|\bssa\b/i, domains: ['ssa.gov']},
  {key: 'medicare', name: 'Medicare', pattern: /\bmedicare\b/i, domains: ['medicare.gov']},
  {key: 'zelle', name: 'Zelle', pattern: /\bzelle\b/i, domains: ['zellepay.com']},
  {key: 'tmobile', name: 'T-Mobile', pattern: /t-?mobile/i, domains: ['t-mobile.com']},
  {key: 'verizon', name: 'Verizon', pattern: /verizon/i, domains: ['verizon.com']},
  {key: 'att', name: 'AT&T', pattern: /\bat&t\b|\batt\b/i, domains: ['att.com']},
  {key: 'coinbase', name: 'Coinbase', pattern: /coinbase/i, domains: ['coinbase.com']},
  {key: 'geeksquad', name: 'Geek Squad', pattern: /geek ?squad/i, domains: ['geeksquad.com', 'bestbuy.com']},
  {key: 'norton', name: 'Norton', pattern: /norton|mcafee/i, domains: ['norton.com', 'mcafee.com']},
  {key: 'medicare', name: 'Medicare', pattern: /medicare/i, domains: ['medicare.gov']},
  {key: 'ezpass', name: 'E-ZPass', pattern: /e-?z ?pass|\btolls? (road|service|authority)\b/i, domains: ['e-zpassny.com', 'ezpassnj.com', 'e-zpassiag.com', 'ezdrivema.com']},
  {key: 'dmv', name: 'DMV', pattern: /\bdmv\b|motor vehicles/i, domains: ['dmv.ca.gov', 'dmv.ny.gov']},
];

const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'ow.ly', 'cutt.ly', 'rb.gy', 'shorturl.at', 'tiny.cc', 'rebrand.ly']);
const RISKY_TLDS = /\.(top|xyz|click|icu|cyou|sbs|buzz|rest|zip|mov|live|shop|support|info|cc|tk|ml|ga|cf|gq)$/i;

const isOfficial = (host: string, brand: Brand) => brand.domains.some(d => host === d || host.endsWith('.' + d));
/** Lowercased hostnames of all http(s) links and bare www. links. */
export function extractHosts(text: string): string[] {
  const hosts = new Set<string>();
  for (const m of text.matchAll(/\b(?:https?:\/\/|www\.)([a-z0-9.-]+\.[a-z]{2,}|\d{1,3}(?:\.\d{1,3}){3})/gi)) {
    hosts.add(m[1].toLowerCase().replace(/^www\./, ''));
  }
  return [...hosts];
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------
export type SignalId =
  | 'urgency' | 'threat' | 'payment' | 'untraceable_payment' | 'credentials' | 'one_time_code'
  | 'prize' | 'remote_access' | 'callback' | 'brand_link_mismatch' | 'brand_sender_mismatch'
  | 'reply_to_mismatch' | 'brand_sensitive_request' | 'compromise_scare' | 'authority_pretext' | 'job_offer' | 'family_emergency' | 'too_good' | 'wrong_number' | 'shortened_link' | 'ip_link' | 'punycode_link' | 'risky_tld' | 'insecure_link' | 'lookalike_domain' | 'auth_failed'
  | 'transaction_alert' | 'new_number' | 'qr_code' | 'surprise_renewal' | 'identity_request';

export interface Signal { id: SignalId; label: string; weight: number }

interface Rule { id: SignalId; weight: number; label: string; test: RegExp }
const TEXT_RULES: Rule[] = [
  {id: 'urgency', weight: 1, label: 'Pressure to act quickly', test: /\b(urgent(ly)?|immediately|right away|asap|tonight|within \d+ ?(hours?|hrs?|minutes?|mins?)|today only|final notice|last chance|expires? (today|soon)|before release)\b/i},
  {id: 'threat', weight: 2, label: 'Threat of suspension, penalty or arrest', test: /\b(late fee|suspend(ed)?|suspension|locked|limited|restricted|deactivat\w+|closed|deleted|terminated|disconnected|legal action|arrest|warrant|lawsuit|penalt(y|ies)|frozen)\b/i},
  {id: 'compromise_scare', weight: 2, label: 'Claims your device or account is compromised', test: /\b(virus|infected|malware|hacked|compromised|fraudulent (order|charge|purchase|activity)|unusual activity)\b/i},
  {id: 'payment', weight: 1, label: 'Asks for a fee or payment', test: /\b(fee|charge|pay(ment)?|invoice|overdue|outstanding balance|refund)\b/i},
  {id: 'untraceable_payment', weight: 3, label: 'Asks for gift cards, crypto or wire transfer', test: /\b(gift ?cards?|itunes card|google play card|bitcoin|btc|crypto(currency)?|usdt|wire transfer|western union|moneygram|zelle|cash ?app)\b/i},
  {id: 'credentials', weight: 2, label: 'Asks you to sign in or confirm identity', test: /\b(password|log ?in|sign ?in|verify (your )?(account|identity)|confirm (your )?(account|details|identity)|\bpin\b)\b/i},
  {id: 'identity_request', weight: 3, label: 'Asks for an ID or account number', test: /\b(reply|send|text|provide|confirm|give|verify|enter)\b[^.\n]{0,30}\b(social security number|ssn|medicare (number|id)|account number|routing number|date of birth|card number)\b/i},
  {id: 'one_time_code', weight: 3, label: 'Asks for a one-time or verification code', test: /\b(one[- ]time (pass)?code|one[- ]time password|verification code|security code|\botp\b|2fa code|code (we|i) (just )?sent)\b/i},
  {id: 'prize', weight: 2, label: 'Unexpected prize, refund or reward', test: /\b(you('ve| have)? won|winner|prize|lottery|sweepstakes|claim your (reward|gift|refund)|free gift|you qualify for (a )?free)\b/i},
  {id: 'remote_access', weight: 3, label: 'Asks to install software or allow remote access', test: /\b(anydesk|teamviewer|remote access|install (this|the) app|screen ?share)\b/i},
  {id: 'authority_pretext', weight: 2, label: 'Asks for secrecy or an unusual favor', test: /\b(i'?m (stuck )?in a meeting|can'?t talk (right )?now|keep this (between us|quiet)|(please )?don'?t tell (anyone|mom|dad|your (parents|family|bank))|it'?s (your|the) (boss|ceo|manager)|from (accounting|payroll|hr)\b)/i},
  {id: 'job_offer', weight: 3, label: 'Unsolicited job offer with easy money', test: /\b(remote (job|position|role|work)|work from home|no experience (needed|required)|hiring now|we are hiring|selected for (a|the|this) (job|position|role)|(liking|rating|reviewing) (videos|products|apps|posts)|recruiter on (telegram|whatsapp))\b|(earn )?\$\d[\d,]* ?(\/|per|a) ?(day|hour|hr)\b/i},
  {id: 'family_emergency', weight: 3, label: 'Urgent family emergency asking for money', test: /\b(grandma|grandpa|mom|dad|it'?s me)\b[\s\S]{0,80}\b(arrested|jail|bail|hospital|accident|lawyer)\b/i},
  {id: 'too_good', weight: 2, label: 'Promises returns that are too good to be true', test: /\b(guaranteed (returns?|profits?|income)|risk[- ]free|double your (money|investment)|\d{2,}% (returns?|profit)|(trading|investment|crypto) (mentor|coach|signals?)|my (mentor|coach)\b)|made \$[\d,]+[^.\n]{0,40}\b(trading|crypto|investing|forex)\b/i},
  {id: 'wrong_number', weight: 2, label: '"Wrong number" opener often used to start romance or crypto scams', test: /\b(is this \w+\?|wrong number|we met at (the|a)\b)/i},
  {id: 'callback', weight: 1, label: 'Pushes you to call a number in the message', test: /\bpress 1\b|\b(call|contact|dial)\b[^.\n]{0,40}(\[number\]|\d{3}[\s.-]?\d{3,4})/i},
  {id: 'transaction_alert', weight: 2, label: 'Alert about a charge you may not recognize', test: /\b(did you (attempt|authori[sz]e|make|approve)|unauthori[sz]ed (charge|purchase|payment|transaction)|(noticed|detected) (a|an) (\$[\d,.]+ )?(purchase|payment|charge|transaction)|if (this was not you|you did not (authori[sz]e|make|request) this))\b/i},
  {id: 'new_number', weight: 3, label: 'Claims to be someone you know on a new number', test: /\b(this is my new number|my new number|lost my phone|dropped my phone|broke my phone|(text|message) me on whatsapp)\b/i},
  {id: 'qr_code', weight: 2, label: 'Asks you to scan a QR code, which can hide a phishing link', test: /\bscan (the |this |our )?(attached )?qr ?code\b/i},
  {id: 'surprise_renewal', weight: 2, label: 'Surprise renewal or charge for something you may not have bought', test: /\b(subscription|membership|plan|invoice)\b[^.\n]{0,40}\b(renews?|renewed|auto-?renew\w*|will be charged|has been charged)\b|\bto cancel,? (please )?call\b/i},
];

const TACTICS = {
  delivery_fee: {label: 'Delivery fee', advice: 'Do not pay through the link. Track the package in the carrier’s official app or website.'},
  account_takeover: {label: 'Account takeover', advice: 'Do not sign in from the link. Open the official app or type the website address yourself, and change your password if you already entered it.'},
  code_theft: {label: 'Verification-code theft', advice: 'Never read a one-time code to anyone. Real companies do not ask for it. Hang up and call the number on the back of your card or in the official app.'},
  payment_fraud: {label: 'Untraceable payment', advice: 'Gift cards, crypto and wire transfers cannot be reversed. Stop contact and verify the request through a channel you already trust.'},
  prize_lure: {label: 'Prize or refund lure', advice: 'Real prizes and refunds never require fees or your banking details. Ignore it.'},
  tech_support: {label: 'Fake tech support', advice: 'Do not install anything or allow remote access. Close the session and contact the company through its official site.'},
  fake_bill: {label: 'Fake bill or fee', advice: 'Do not pay through the link. Sign in to the official website or app yourself to check whether you owe anything.'},
  job_scam: {label: 'Job offer scam', advice: 'Real employers do not recruit by surprise text or ask you to pay or move money. Do not reply; look up the company yourself.'},
  family_emergency: {label: 'Family impersonation', advice: 'Stop replying and call your family member directly on a number you already have. Never send money on request from a new number.'},
  fake_fraud_alert: {label: 'Fake fraud alert', advice: 'Do not reply or call the number in the message. Check recent activity in your bank’s official app, or call the number on the back of your card.'},
  investment: {label: 'Investment scam', advice: 'Guaranteed returns do not exist. Do not send money or crypto; check the firm with your financial regulator.'},
  relationship_opener: {label: 'Wrong-number opener', advice: 'Do not continue the chat. These friendly "wrong number" messages often lead to romance or crypto scams.'},
  impersonation: {label: 'Brand impersonation', advice: 'Contact the organization using its official app or a number you look up yourself.'},
  unclassified: {label: 'No clear scam pattern', advice: 'If you are unsure, contact the organization through a channel you already trust.'},
} as const;
export type Tactic = keyof typeof TACTICS;

export interface Analysis {
  /** Campaign key: `${tactic}:${brand}`; 'unclassified' when no scam pattern. */
  key: string;
  label: string;
  tactic: Tactic;
  brand: string;
  brandName: string;
  signals: Signal[];
  /** Kept for UI/back-compat: signal labels. */
  evidence: string[];
  /** Link hosts found in the text (lowercased). */
  hosts: string[];
  senderDomain: string;
  headline: string;
  score: number;
  riskLevel: 'high' | 'medium' | 'low';
  confidence: 'high' | 'medium' | 'low';
  recommendation: string;
}

function pickTactic(ids: Set<SignalId>, text: string, brand?: Brand): Tactic {
  if (ids.has('family_emergency') || ids.has('new_number')) return 'family_emergency';
  if (ids.has('remote_access') || /\b(virus|infected|tech support|refund department|call (microsoft |apple |windows )?support)\b/i.test(text)) return 'tech_support';
  if (ids.has('one_time_code')) return 'code_theft';
  if (ids.has('transaction_alert') && (ids.has('callback') || ids.has('brand_link_mismatch') || ids.has('shortened_link'))) return 'fake_fraud_alert';
  if (ids.has('too_good')) return 'investment';
  if (ids.has('untraceable_payment')) return 'payment_fraud';
  if (ids.has('job_offer')) return 'job_scam';
  const riskyLink = ids.has('shortened_link') || ids.has('brand_link_mismatch') || ids.has('lookalike_domain') || ids.has('ip_link') || ids.has('punycode_link');
  if (/\b(deliver(y|ed)?|package|parcel|shipment|redelivery)\b/i.test(text) && (ids.has('payment') || ids.has('urgency') || riskyLink)) return 'delivery_fee';
  if (ids.has('surprise_renewal') || (ids.has('payment') && (riskyLink || ids.has('threat')))) return 'fake_bill';
  if (ids.has('wrong_number')) return 'relationship_opener';
  if (ids.has('prize')) return 'prize_lure';
  if (ids.has('threat') || ids.has('identity_request') || (ids.has('credentials') && riskyLink)) return 'account_takeover';
  if (brand && (ids.has('brand_link_mismatch') || ids.has('brand_sender_mismatch'))) return 'impersonation';
  return 'unclassified';
}

/**
 * Explainable rule-based analysis. Every signal has a plain-language label and weight; the score and
 * qualitative confidence derive only from those. No probabilities are invented.
 */
export function analyze(raw: string): Analysis {
  const msg = parseMessage(raw);
  const text = raw;
  // A genuine code message says "do not share"; only count it when someone asks for the code.
  const genuineCode = /\b(do not|don'?t|never) share\b/i.test(text) && !/\b(send|tell|read|give|share)\b[^.\n]{0,20}\b(me|us)\b/i.test(text);
  const signals: Signal[] = TEXT_RULES.filter(r => r.test.test(text) && !(r.id === 'one_time_code' && genuineCode)).map(({id, weight, label}) => ({id, weight, label}));
  const hosts = extractHosts(text);
  // "Apple gift cards" names a payment method, not the sender: ignore brands inside gift-card phrases.
  const brandText = text.replace(/\b(apple|google play|amazon|itunes|steam|target|walmart)\s+gift ?cards?\b/gi, 'gift cards');
  const brand = BRANDS.find(b => b.pattern.test(brandText));
  const add = (id: SignalId, weight: number, label: string) => { if (!signals.some(s => s.id === id)) signals.push({id, weight, label}); };

  const LOOKALIKE = /[a-z][01](?:[a-z]|\.|-)|[a-z]-(secure|verify|login|account|support|update|billing)\b/i;
  for (const host of hosts) {
    if (SHORTENERS.has(host)) add('shortened_link', 3, `Link hidden behind a URL shortener (${host})`);
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) add('ip_link', 3, 'Link points to a raw IP address');
    if (host.includes('xn--')) add('punycode_link', 3, `Link uses look-alike characters (${host})`);
    if (RISKY_TLDS.test(host)) add('risky_tld', 1, `Link uses a domain ending often abused for scams (${host})`);
    if (LOOKALIKE.test(host)) add('lookalike_domain', 2, `Domain dressed up to look official (${host})`);
    if (brand && !isOfficial(host, brand)) add('brand_link_mismatch', 3, `Mentions ${brand.name}, but the link goes to ${host}`);
  }
  if (msg.senderDomain && LOOKALIKE.test(msg.senderDomain)) add('lookalike_domain', 2, `Sender domain dressed up to look official (${msg.senderDomain})`);
  // A real "log in to the app" notice has no link; credential requests only count with one.
  if (brand && signals.some(s => s.id === 'one_time_code' || s.id === 'untraceable_payment' || s.id === 'identity_request' || (s.id === 'credentials' && hosts.length > 0))) add('brand_sensitive_request', 2, `Claims to be ${brand.name} and asks for sensitive information`);
  if (/\bhttp:\/\//i.test(text)) add('insecure_link', 1, 'Link is not encrypted (http)');
  if (brand && msg.senderDomain && !isOfficial(msg.senderDomain, brand)) add('brand_sender_mismatch', 3, `Claims to be ${brand.name}, but was sent from ${msg.senderDomain}`);
  if (msg.authFailures.length) add('auth_failed', 3, `Email failed sender checks (${msg.authFailures.join(', ')}): it may not come from who it says`);
  if (msg.replyToDomain && msg.senderDomain && msg.replyToDomain !== msg.senderDomain) add('reply_to_mismatch', 2, `Replies go to a different domain (${msg.replyToDomain})`);

  const score = signals.reduce((sum, s) => sum + s.weight, 0);
  const ids = new Set(signals.map(s => s.id));
  const tactic = score >= 2 ? pickTactic(ids, text, brand) : 'unclassified';
  const brandKey = brand?.key ?? 'unbranded';
  const key = tactic === 'unclassified' ? 'unclassified' : `${tactic}:${brandKey}`;
  const riskLevel = score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low';
  const confidence = signals.length >= 4 ? 'high' : signals.length >= 2 ? 'medium' : 'low';
  const label = tactic === 'unclassified' ? TACTICS.unclassified.label : `${brand ? brand.name + ' · ' : ''}${TACTICS[tactic].label}`;
  return {
    key, label, tactic, brand: brandKey, brandName: brand?.name ?? '', signals, evidence: signals.map(s => s.label), hosts,
    senderDomain: msg.senderDomain, headline: msg.headline, score, riskLevel, confidence, recommendation: TACTICS[tactic].advice,
  };
}

/** Only classified analyses create or join a campaign. */
export function isLinkable(key: string) { return key !== 'unclassified'; }

export function transition(current: string, next: string) {
  const allowed: Record<string, string[]> = {reported: ['analyzed'], analyzed: ['linked', 'protected'], linked: ['protected'], protected: ['resolved']};
  if (!allowed[current]?.includes(next)) throw new Error(`Invalid transition: ${current} → ${next}`);
  return next;
}

// ---------------------------------------------------------------------------
// Calls (ElevenLabs conversations), statuses normalized for the public table.
// ---------------------------------------------------------------------------
export const CALL_STATUSES = ['ringing', 'in_progress', 'processing', 'done', 'failed'] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];
export function normalizeCallStatus(providerStatus: string): CallStatus | undefined {
  return ({initiated: 'ringing', 'in-progress': 'in_progress', processing: 'processing', done: 'done', failed: 'failed'} as Record<string, CallStatus>)[providerStatus];
}

// ---------------------------------------------------------------------------
// Customer-facing verdict (iMessage reply and customer view share this wording)
// ---------------------------------------------------------------------------
export const VERDICT_TITLE: Record<Analysis['riskLevel'], string> = {
  high: 'This is very likely a scam',
  medium: 'This looks suspicious',
  low: 'No clear scam pattern',
};

/** Short plain-text reply for a reported message: verdict, the two strongest reasons, one next step. */
export function verdictReply(a: Analysis): string {
  const reasons = [...a.signals].sort((x, y) => y.weight - x.weight).slice(0, 2).map(s => s.label.replace(/\s*\([^)]*\)$/, ''));
  const why = reasons.length ? ` Why: ${reasons.join('; ')}.` : '';
  return `${VERDICT_TITLE[a.riskLevel]}.${why} ${a.recommendation} (Scamnasium test line. Warning signs, not proof.)`;
}
