export const scenarios = {
 delivery: {channel:'sms', text:'Delivery attempt failed. Confirm delivery details and a $1.25 redelivery fee at https://parcel-check.example.com/confirm within 2 hours.'},
 variant: {channel:'sms', text:'Parcel pending: small handling charge required before release. Visit https://parcel-check.example.com/pay today.'},
 bank: {channel:'email', text:'Example Bank security alert: verify your password urgently at https://account-check.example.com/login.'},
 voice: {channel:'call', text:'Fictional support caller: urgently share your one-time password to verify your account.'},
} as const;
export type Scenario = keyof typeof scenarios;
export const externalSources = {elevenlabs_call:'call', photon_imessage:'imessage'} as const;
export type ExternalSource = keyof typeof externalSources;
export const MAX_SUMMARY_LENGTH = 400;
/** Redacts contact details and long digit runs, strips control characters, caps length. Applied by gateway and reducer. */
export function sanitizeSummary(text:string):string {
 return text
  .replace(/[\u0000-\u001f\u007f]+/g,' ')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]')
  .replace(/\+?\d[\d\s().-]{6,}\d/g,'[number]')
  .replace(/\d{4,}/g,'[number]')
  .replace(/\s+/g,' ')
  .trim()
  .slice(0,MAX_SUMMARY_LENGTH);
}
export function analyze(text:string) {
 const delivery=/delivery|parcel/i.test(text), otp=/one-time (pass)?code|one-time password|\botp\b|verification code/i.test(text), credential=/password|log ?in|bank|account/i.test(text);
 const host=text.match(/https:\/\/([a-z0-9.-]+)/i)?.[1]?.toLowerCase() ?? '';
 const evidence=[/urgently|urgent|within|today|before release|immediately/i.test(text)?'Urgency or deadline pressure':'', /fee|charge|payment|gift card|wire/i.test(text)?'Payment requested through supplied link':'', /password|\botp\b|one-time|verification code/i.test(text)?'Sensitive credential requested':'',host?'Link is an unverified synthetic hostname':''].filter(Boolean);
 const key=delivery && host==='parcel-check.example.com'?'parcel-fee':otp?'support-otp':credential&&evidence.length?'bank-login':evidence.length?'other-scam':'unclassified';
 const label={'parcel-fee':'Parcel fee impersonation','support-otp':'Support OTP theft','bank-login':'Bank credential lure','other-scam':'Unlinked warning signs','unclassified':'Unclassified report'}[key];
 const recommendation=delivery?'Do not pay using the message link. Check delivery in the courier’s official app.':key==='unclassified'?'No common scam signals were found. If unsure, contact the organization using its official app or a number you independently verified.':'Do not share passwords or one-time codes. Contact the organization using its official app or a number you independently verified.';
 return {key, label, evidence, confidence:evidence.length>=2?'high':evidence.length===1?'medium':'low', recommendation};
}
/** Only these analysis keys create or join a campaign. */
export function isLinkable(key:string){return key!=='unclassified'&&key!=='other-scam';}
export function transition(current:string,next:string) {
 const allowed:Record<string,string[]>={reported:['analyzed'],analyzed:['linked','protected'],linked:['protected'],protected:['resolved']};
 if(!allowed[current]?.includes(next)) throw new Error(`Invalid transition: ${current} → ${next}`);
 return next;
}
