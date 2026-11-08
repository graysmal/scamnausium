import { execFileSync } from 'node:child_process';
import { existsSync,readFileSync,writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if(existsSync('.env')){console.log('.env already exists; preserved. Check it manually if the publishing identity changed.');process.exit(0);}
const output=execFileSync('spacetime',['login','show','--token'],{encoding:'utf8'});
const token=output.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
if(!token) throw new Error('No local CLI identity token found. Publish the module locally first.');
const template=readFileSync('.env.example','utf8');
writeFileSync('.env',template.replace('OPERATOR_DEMO_SECRET=','OPERATOR_DEMO_SECRET='+randomBytes(24).toString('hex')).replace('SPACETIMEDB_SERVICE_TOKEN=','SPACETIMEDB_SERVICE_TOKEN='+token),{mode:0o600});
console.log('Created private .env. Copy OPERATOR_DEMO_SECRET into the dashboard operator field. Keep this file private.');
