export interface Env {
  AI_ROUTER_SECRET: string;
  OPENROUTER_API_KEY?: string;
  PICSART_API_KEY?: string;
  GAMMA_API_KEY?: string;
  GROQ_API_KEY_1?: string; GROQ_API_KEY_2?: string; GROQ_API_KEY_3?: string; GROQ_API_KEY_4?: string; GROQ_API_KEY_5?: string;
  GROQ_API_KEY_6?: string; GROQ_API_KEY_7?: string; GROQ_API_KEY_8?: string; GROQ_API_KEY_9?: string; GROQ_API_KEY_10?: string;
  GEMINI_API_KEY_1?: string; GEMINI_API_KEY_2?: string; GEMINI_API_KEY_3?: string; GEMINI_API_KEY_4?: string; GEMINI_API_KEY_5?: string;
  GEMINI_API_KEY_6?: string; GEMINI_API_KEY_7?: string; GEMINI_API_KEY_8?: string; GEMINI_API_KEY_9?: string; GEMINI_API_KEY_10?: string;
  ROUTING_MODEL?: string;
  USER_REQUESTS_PER_MINUTE?: string;
  SERVICE_REQUESTS_PER_MINUTE?: string;
  PROVIDER_TIMEOUT_MS?: string;
  ROUTING_TIMEOUT_MS?: string;
  REQUEST_GATES: DurableObjectNamespace;
  KEY_POOLS: DurableObjectNamespace;
}
export type Provider = 'openrouter' | 'groq' | 'gemini';
export type ModelCandidate = { id: string; provider?: Provider; priority?: number; modalities?: string[]; task?: string };
