export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'botuser',
    password: process.env.DB_PASSWORD ?? 'botpassword',
    database: process.env.DB_DATABASE ?? 'whatsapp_bot',
  },
  whitelist: {
    // Comma-separated phone numbers (no "+", e.g. 628123456789) that bypass the DB
    // whitelist entirely — needed to bootstrap/manage the whitelist via chat commands.
    adminNumbers: process.env.ADMIN_NUMBERS ?? '',
  },
  ai: {
    // 'anthropic' (default) or 'chat-combos' — picks which LlmProvider the whole bot uses.
    provider: process.env.AI_PROVIDER ?? 'anthropic',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.CLAUDE_MODEL ?? 'claude-haiku-4-5-20251001',
  },
  chatCombos: {
    // Internal ChatCombos gateway — OpenAI-compatible chat completions with standard
    // Bearer auth. Model id is whatever the gateway currently routes to.
    apiKey: process.env.CHAT_COMBOS_API_KEY ?? '',
    baseUrl: process.env.CHAT_COMBOS_BASE_URL ?? 'http://10.20.30.50:20128/v1',
    model: process.env.CHAT_COMBOS_MODEL ?? 'chat-combos',
    // Headroom for reasoning-style models the gateway might route to — hidden
    // chain-of-thought eats into the same budget as the visible reply.
    maxTokens: parseInt(process.env.CHAT_COMBOS_MAX_TOKENS ?? '2048', 10),
  },
  openweather: {
    apiKey: process.env.OPENWEATHER_API_KEY ?? '',
    baseUrl:
      process.env.OPENWEATHER_BASE_URL ??
      'https://api.openweathermap.org/data/2.5',
  },
});
