import 'dotenv/config';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:4000';
const status=await fetch(base+'/api/status').then(r=>r.json());assert.equal(status.database,'Connected');assert.notEqual(status.photon,'Live');
const denied=await fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'inject',scenarioId:'delivery'})});assert.equal(denied.status,401);
const headers={'Content-Type':'application/json',Authorization:`Bearer ${process.env.OPERATOR_DEMO_SECRET}`};
const ok=await fetch(base+'/api/action',{method:'POST',headers,body:JSON.stringify({action:'inject',scenarioId:'bank'})});assert.equal(ok.status,200);
const rate=await fetch(base+'/api/action',{method:'POST',headers,body:JSON.stringify({action:'inject',scenarioId:'bank'})});assert.equal(rate.status,429);
console.log('PASS: gateway status, unauthorized request, authenticated scenario injection, rate limit.');
