export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseService: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")).replace(/\/$/, ""),
  cronSecret: process.env.CRON_SECRET ?? "",
  openrouterKey: process.env.OPENROUTER_API_KEY ?? "",
  telnyxKey: process.env.TELNYX_API_KEY ?? "",
  telnyxNumber: process.env.TELNYX_PHONE_NUMBER ?? "",
  telnyxMessagingProfile: process.env.TELNYX_MESSAGING_PROFILE_ID ?? "",
  telnyxCredConnection: process.env.TELNYX_CREDENTIAL_CONNECTION_ID ?? "",
  telnyxPublicKey: process.env.TELNYX_PUBLIC_KEY ?? "",
  resendKey: process.env.RESEND_API_KEY ?? "",
  resendFrom: process.env.RESEND_FROM ?? "Newport Smog <onboarding@resend.dev>",
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET ?? "",
  calendlyToken: process.env.CALENDLY_TOKEN ?? "",
  calendlySigningKey: process.env.CALENDLY_WEBHOOK_SIGNING_KEY ?? "",
  pandadocKey: process.env.PANDADOC_API_KEY ?? "",
  pandadocTemplate: process.env.PANDADOC_TEMPLATE_ID ?? "",
  pandadocWebhookKey: process.env.PANDADOC_WEBHOOK_KEY ?? "",
  mercuryToken: process.env.MERCURY_API_TOKEN ?? "",
  mercuryAccount: process.env.MERCURY_ACCOUNT_ID ?? "",
};
export const integrationStatus = () => ({
  openrouter: !!env.openrouterKey,
  telnyx_sms: !!(env.telnyxKey && env.telnyxNumber),
  telnyx_voice: !!(env.telnyxKey && env.telnyxCredConnection),
  resend: !!env.resendKey,
  calendly: !!env.calendlyToken,
  pandadoc: !!(env.pandadocKey && env.pandadocTemplate),
  mercury: !!env.mercuryToken,
});
export class IntegrationError extends Error {
  constructor(public provider: string, message: string) { super(`${provider}: ${message}`); }
}
export function requireKey(provider: string, value: string, name: string) {
  if (!value) throw new IntegrationError(provider, `${name} is not set. Add it in Vercel → Settings → Environment Variables.`);
  return value;
}
