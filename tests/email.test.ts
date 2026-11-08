import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze, parseMessage, sanitizeSummary } from '../spacetimedb/src/domain';
import { compactEmail, decodeHeader, htmlToText, isRawEmail } from '../spacetimedb/src/email';

const eml = readFileSync(new URL('./fixtures/paypal-phish.eml', import.meta.url), 'utf8');

test('raw email is compacted to headers, auth results and readable body', () => {
  assert.ok(isRawEmail(eml));
  assert.ok(!isRawEmail('From: a@b.com\nSubject: hi\n\nbody'));
  const compact = compactEmail(eml);
  assert.match(compact, /^From: PayPal Service <service@paypa1-billing\.example\.com>$/m);
  assert.match(compact, /^Subject: Your account has been limited – action required$/m);
  assert.match(compact, /^Auth: spf=softfail dkim=none dmarc=fail$/m);
  assert.match(compact, /Restore account \(http:\/\/bit\.ly\/restore-access\)/);
  assert.doesNotMatch(compact, /<p|<html|color:red|Received:/);
});

test('compacted email keeps its signals after the 600-char reducer cap', () => {
  const stored = sanitizeSummary(compactEmail(eml));
  const msg = parseMessage(stored);
  assert.deepEqual(msg.authFailures, ['SPF softfail', 'DMARC fail']);
  assert.equal(msg.replyToDomain, 'secure-resolve.example.net');
  const a = analyze(stored);
  const ids = a.signals.map(s => s.id);
  for (const id of ['auth_failed', 'brand_sender_mismatch', 'reply_to_mismatch', 'shortened_link']) assert.ok(ids.includes(id as never), id);
  assert.equal(a.riskLevel, 'high');
});

test('header and html decoding helpers', () => {
  assert.equal(decodeHeader('=?utf-8?Q?Caf=C3=A9_menu?='), 'Café menu');
  assert.equal(decodeHeader('plain'), 'plain');
  assert.equal(htmlToText('<p>Hi &amp; bye</p><a href="https://x.example/a">go</a>'), 'Hi & bye\ngo (https://x.example/a)');
  assert.equal(compactEmail('just a text'), 'just a text');
});
