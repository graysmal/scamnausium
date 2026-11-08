// Applies docs/voice-agent-prompt.md to the ElevenLabs agent, enables the end_call system tool,
// calms the voice (higher stability, slightly slower) and caps call length so the honeypot can't burn credits.
//   npm run agent:prompt               preview only (reads the agent, writes a backup, changes nothing)
//   npm run agent:prompt -- --apply    PATCH the agent
// Needs ELEVENLABS_API_KEY (agent read/write) and ELEVENLABS_AGENT_ID. Endpoint and field names from @elevenlabs/elevenlabs-js 2.77.
import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const apiKey = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_AGENT_ID;
if (!apiKey || !agentId) throw new Error('Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in .env');
const apply = process.argv.includes('--apply');

const doc = readFileSync(new URL('../docs/voice-agent-prompt.md', import.meta.url), 'utf8');
const block = (name: string) => {
  const match = doc.match(new RegExp('```' + name + '\\n([\\s\\S]*?)\\n```'));
  if (!match) throw new Error(`Block \`${name}\` not found in docs/voice-agent-prompt.md`);
  return match[1].trim();
};
const firstMessage = block('first-message');
const systemPrompt = block('system-prompt');
// Calm, slightly slow "Pat": higher stability reads as less excitable; speed 1.0 is normal (range about 0.7–1.2).
const VOICE = {stability: 0.75, speed: 0.92};
const maxCallSecs = Math.min(Math.max(Number(process.env.AGENT_MAX_CALL_SECS ?? 600), 60), 1800);

const url = `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`;
const headers = {'xi-api-key': apiKey, 'Content-Type': 'application/json'};

const res = await fetch(url, {headers});
if (!res.ok) throw new Error(`GET agent failed: ${res.status} ${await res.text()}`);
type Json = Record<string, unknown>;
const agent = (await res.json()) as {name?: string; conversation_config?: {agent?: {first_message?: string; prompt?: Json}; tts?: Json; conversation?: Json}};
mkdirSync('.agent-backups', {recursive: true});
const backup = `.agent-backups/${agentId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(backup, JSON.stringify(agent, null, 2));

const currentPrompt = agent.conversation_config?.agent?.prompt ?? {};
const builtIn = (currentPrompt.built_in_tools as Record<string, unknown> | undefined) ?? {};
console.log(`Agent: ${agent.name ?? agentId}  (backup: ${backup})`);
console.log(`First message: ${JSON.stringify(agent.conversation_config?.agent?.first_message ?? '')} -> ${JSON.stringify(firstMessage)}`);
console.log(`Prompt: ${String(currentPrompt.prompt ?? '').length} chars -> ${systemPrompt.length} chars`);
console.log(`end_call tool: ${builtIn.end_call ? 'already on' : 'off -> on'}`);
const tts = agent.conversation_config?.tts ?? {};
const conversation = agent.conversation_config?.conversation ?? {};
console.log(`Voice: stability ${tts.stability ?? 'default'} -> ${VOICE.stability}, speed ${tts.speed ?? 'default'} -> ${VOICE.speed}`);
console.log(`Max call length: ${conversation.max_duration_seconds ?? 'default'}s -> ${maxCallSecs}s`);

if (!apply) {
  console.log('\nPreview only. Re-run with --apply to update the agent.');
  process.exit(0);
}

// Send the full existing prompt object with our overrides so unrelated settings (LLM, temperature, tools) are kept.
const body = {
  conversation_config: {
    agent: {
      first_message: firstMessage,
      prompt: {
        ...currentPrompt,
        prompt: systemPrompt,
        built_in_tools: {
          ...builtIn,
          end_call: builtIn.end_call ?? {type: 'system', name: 'end_call', description: 'End the call after saying goodbye, or when the caller hangs up, goes silent, or reached this line by mistake.', params: {system_tool_type: 'end_call'}},
        },
      },
    },
    // Only the changed fields: echoing the whole tts/conversation objects back could include read-only ones.
    tts: VOICE,
    conversation: {max_duration_seconds: maxCallSecs},
  },
};
const patch = await fetch(url, {method: 'PATCH', headers, body: JSON.stringify(body)});
if (!patch.ok) throw new Error(`PATCH agent failed: ${patch.status} ${await patch.text()}`);
console.log('Agent updated. Restore with the backup file if needed.');
