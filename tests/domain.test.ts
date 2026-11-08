import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze,scenarios,transition } from '../spacetimedb/src/domain';
test('parcel variants correlate on evidence while bank remains distinct',()=>{assert.equal(analyze(scenarios.delivery.text).key,analyze(scenarios.variant.text).key);assert.notEqual(analyze(scenarios.delivery.text).key,analyze(scenarios.bank.text).key);assert.equal(analyze(scenarios.voice.text).key,'code_theft:amazon');});
test('incident state machine rejects skipping analysis and repeated protection',()=>{assert.equal(transition('reported','analyzed'),'analyzed');assert.throws(()=>transition('reported','protected'));assert.throws(()=>transition('protected','protected'));assert.equal(transition('linked','dismissed'),'dismissed');assert.throws(()=>transition('reported','dismissed'));assert.throws(()=>transition('dismissed','linked'));});

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
    ['Zelle: We noticed a payment of $500 to John. If you did not authorize this, call our fraud team at 888-555-0100.', 'fake_fraud_alert', 'high'],
    ['Hi Mom, I dropped my phone in the toilet. This is my new number. Can you text me on WhatsApp?', 'family_emergency', 'medium'],
    ['Your Microsoft account will be deleted today. Call support at 1-800-555-0199 immediately.', 'tech_support', 'medium'],
    ['Hey! I made $12,000 last month trading crypto with my mentor, want me to introduce you?', 'investment', 'high'],
    ['Medicare: you qualify for a free back brace. Reply with your Medicare number to claim.', 'prize_lure', 'high'],
    ['Hello, this is the Geek Squad. Your annual subscription of $399.99 renews today. To cancel call 888-555-0123.', 'fake_bill', 'medium'],
    ['We are hiring! Earn $300/day liking YouTube videos. Contact our recruiter on Telegram.', 'job_scam', 'medium'],
    ['Scan the QR code in the attached letter to avoid suspension of your vehicle registration.', 'account_takeover', 'medium'],
    ['Your Uber driver is arriving now.', 'unclassified', 'low'],
    ['Chase: Your statement is ready. Log in to the Chase app to view it.', 'unclassified', 'low'],
    ['Your verification code is 482913. Do not share it with anyone.', 'unclassified', 'low'],
    ['Reminder: dentist appointment tomorrow at 3pm. Reply C to confirm.', 'unclassified', 'low'],
  ];
  for (const [text, tactic, minRisk] of cases) {
    const a = analyze(text);
    assert.equal(a.tactic, tactic, text);
    assert.ok(rank[a.riskLevel] >= rank[minRisk], `${text} -> ${a.riskLevel}`);
    if (tactic === 'unclassified') assert.equal(a.riskLevel, 'low', text);
  }
});
