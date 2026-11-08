export const scenarios = {
 delivery: {channel:'sms', text:'Delivery attempt failed. Confirm delivery details and a $1.25 redelivery fee at https://parcel-check.example.com/confirm within 2 hours.'},
 variant: {channel:'sms', text:'Parcel pending: small handling charge required before release. Visit https://parcel-check.example.com/pay today.'},
 bank: {channel:'email', text:'Example Bank security alert: verify your password urgently at https://account-check.example.com/login.'},
 voice: {channel:'call', text:'Fictional support caller: urgently share your one-time password to verify your account.'},
} as const;
export type Scenario = keyof typeof scenarios;
export function analyze(text:string) {
 const delivery=/delivery|parcel/i.test(text), otp=/one-time password|\botp\b/i.test(text);
 const host=text.match(/https:\/\/([a-z0-9.-]+)/i)?.[1]?.toLowerCase() ?? '';
 const evidence=[/urgently|urgent|within|today|before release/i.test(text)?'Urgency or deadline pressure':'', /fee|charge|payment/i.test(text)?'Payment requested through supplied link':'', /password|\botp\b/i.test(text)?'Sensitive credential requested':'',host?'Link is an unverified synthetic hostname':''].filter(Boolean);
 return {key:delivery && host==='parcel-check.example.com'?'parcel-fee':otp?'support-otp':'bank-login', label:delivery?'Parcel fee impersonation':otp?'Support OTP theft':'Bank credential lure', evidence, confidence:evidence.length>=2?'high':'medium', recommendation:delivery?'Do not pay using the message link. Check delivery in the courier’s official app.': 'Do not share passwords or one-time codes. Contact the organization using its official app or a number you independently verified.'};
}
export function transition(current:string,next:string) {
 const allowed:Record<string,string[]>={reported:['analyzed'],analyzed:['linked'],linked:['protected'],protected:['resolved']};
 if(!allowed[current]?.includes(next)) throw new Error(`Invalid transition: ${current} → ${next}`);
 return next;
}
