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
  ai: {
    // 'anthropic' (default) or 'hermes' — picks which LlmProvider the whole bot uses.
    provider: process.env.AI_PROVIDER ?? 'anthropic',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.CLAUDE_MODEL ?? 'claude-haiku-4-5-20251001',
  },
  hermes: {
    // Internal Hermes gateway — OpenAI-compatible chat completions, but auth is the
    // raw key with no "Bearer " prefix. Model id is whatever the gateway currently routes.
    apiKey: process.env.HERMES_API_KEY ?? '',
    baseUrl: process.env.HERMES_BASE_URL ?? 'http://10.20.30.50:8645/v1',
    model: process.env.HERMES_MODEL ?? 'upstage/solar-pro4:free',
  },
  openweather: {
    apiKey: process.env.OPENWEATHER_API_KEY ?? '',
    baseUrl:
      process.env.OPENWEATHER_BASE_URL ?? 'https://api.openweathermap.org/data/2.5',
  },
});
