import 'server-only';
export const env = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  supabaseService: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  openrouterKey: process.env.OPENROUTER_API_KEY ?? '',
  gammaApiKey: process.env.GAMMA_API_KEY ?? '',
  aiRouterUrl: process.env.AI_ROUTER_URL ?? '',
  aiRouterSecret: process.env.AI_ROUTER_SECRET ?? '',
  adminEmails: (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  cronSecret: process.env.CRON_SECRET ?? '',
  exchangeRateApiKey: process.env.EXCHANGE_RATE_API_KEY ?? '',
  b2: {
    endpoint: process.env.B2_ENDPOINT ?? '',
    region: process.env.B2_REGION ?? '',
    keyId: process.env.B2_KEY_ID ?? '',
    appKey: process.env.B2_APPLICATION_KEY ?? '',
    bucket: process.env.B2_BUCKET ?? '',
  },
};
