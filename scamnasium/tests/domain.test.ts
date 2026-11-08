import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze,scenarios,transition } from '../spacetimedb/src/domain';
test('parcel variants correlate on evidence while bank remains distinct',()=>{assert.equal(analyze(scenarios.delivery.text).key,analyze(scenarios.variant.text).key);assert.notEqual(analyze(scenarios.delivery.text).key,analyze(scenarios.bank.text).key);assert.equal(analyze(scenarios.voice.text).key,'support-otp');});
test('incident state machine rejects skipping analysis and repeated protection',()=>{assert.equal(transition('reported','analyzed'),'analyzed');assert.throws(()=>transition('reported','protected'));assert.throws(()=>transition('protected','protected'));});
