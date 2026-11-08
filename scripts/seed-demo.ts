// Resets the local demo and fills it through the gateway exactly like an operator would:
// the four simulated scenarios plus a handful of pasted reports. Never fabricates provider (call/iMessage) events.
// Usage: npm run seed   (gateway must be running; reads OPERATOR_DEMO_SECRET from .env or DOTENV_CONFIG_PATH)
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const base = `http://127.0.0.1:${process.env.PORT ?? 4000}`;
const secret = process.env.OPERATOR_DEMO_SECRET;
if (!secret) throw new Error('OPERATOR_DEMO_SECRET is not set.');
const headers = {'Content-Type': 'application/json', Authorization: `Bearer ${secret}`};

async function call(path: string, body: unknown) {
  const res = await fetch(base + path, {method: 'POST', headers, body: JSON.stringify(body)});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(data)}`);
  await sleep(150);
  return data;
}

const reports: {channel: 'sms' | 'email' | 'imessage'; text: string}[] = [
  {channel: 'email', text: 'From: "PayPal" <service@paypa1-billing.example.com>\nReply-To: refunds@mailbox.example.org\nSubject: Your account has been limited\n\nWe noticed unusual activity on your account. Log in within 24 hours to restore access: https://paypa1-billing.example.com/restore'},
  {channel: 'sms', text: 'Amazon: a purchase of $849.99 was placed on your account. If this was not you, reply with the verification code we just sent to cancel.'},
  {channel: 'sms', text: "Hi, it's Dana from accounting. I'm stuck in a meeting. Can you buy three Apple gift cards for a client today and text me the codes? I'll reimburse you."},
  {channel: 'email', text: 'From: "Microsoft Support" <alerts@ms-account-support.example.net>\nSubject: Security alert: your computer is infected\n\nWe detected malware on your device. Call us now at 1-888-555-0123 and install AnyDesk so a technician can fix it immediately.'},
  {channel: 'sms', text: 'USPS: final notice. Your parcel is held at our facility. Pay the $2.10 redelivery fee today: https://usps-redelivery.example.com/release'},
  {channel: 'sms', text: 'Zelle: We noticed a payment of $500 to John. If you did not authorize this, call our fraud team at 888-555-0100.'},
  {channel: 'imessage', text: 'Hi Mom, I dropped my phone in the toilet. This is my new number. Can you text me on WhatsApp?'},
  {channel: 'sms', text: 'Are we still on for lunch tomorrow at noon?'},
  // A raw email exactly as "Show original" exports it: the gateway decodes it and checks SPF/DKIM/DMARC.
  {channel: 'email', text: readFileSync(new URL('../tests/fixtures/paypal-phish.eml', import.meta.url), 'utf8')},
];

await call('/api/action', {action: 'reset'});
for (const scenarioId of ['delivery', 'variant', 'bank', 'voice']) await call('/api/action', {action: 'inject', scenarioId});
for (const r of reports) await call('/api/report', r);
console.log(`Seeded 4 scenarios and ${reports.length} reported messages.`);
