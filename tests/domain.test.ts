import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze,scenarios,transition } from '../spacetimedb/src/domain';
test('parcel variants correlate on evidence while bank remains distinct',()=>{assert.equal(analyze(scenarios.delivery.text).key,analyze(scenarios.variant.text).key);assert.notEqual(analyze(scenarios.delivery.text).key,analyze(scenarios.bank.text).key);assert.equal(analyze(scenarios.voice.text).key,'code_theft:amazon');});
test('incident state machine rejects skipping analysis and repeated protection',()=>{assert.equal(transition('reported','analyzed'),'analyzed');assert.throws(()=>transition('reported','protected'));assert.throws(()=>transition('protected','protected'));});

// Regression corpus: tactic + minimum risk for common scam types and benign texts.
test('analyzer corpus: common scam types get the right tactic and risk', () => {
  const rank = {low: 0, medium: 1, high: 2} as const;
  const cases: [string, string, keyof typeof rank][] = [
    ['E-ZPass: You have an unpaid toll balance of $4.15. Pay within 24 hrs to avoid a $50 late fee: https://ezpass-tolls.example.com/pay', 'fake_bill', 'high'],
    ['Congratulations! You have been selected for a remote position paying $500/day, no experience needed.', 'job_scam', 'medium'],
    ["Grandma it's me, I got arrested and need bail money tonight. Please don't tell mom.", 'family_emergency', 'high'],
    ['Guaranteed 300% returns on bitcoin in 2 weeks, risk-free.', 'investment', 'high'],
    ['Your Apple ID has been locked. Verify now at https://appIe-support.example.com', 'account_takeover', 'high'],
    ['Hi, is this Linda? We met at the conference last week.', 'relationship_opener', 'low'],
    ['Your Uber driver is arriving now.', 'unclassified', 'low'],
    ['Reminder: dentist appointment tomorrow at 3pm. Reply C to confirm.', 'unclassified', 'low'],
  ];
  for (const [text, tactic, minRisk] of cases) {
    const a = analyze(text);
    assert.equal(a.tactic, tactic, text);
    assert.ok(rank[a.riskLevel] >= rank[minRisk], `${text} -> ${a.riskLevel}`);
    if (tactic === 'unclassified') assert.equal(a.riskLevel, 'low', text);
  }
});
