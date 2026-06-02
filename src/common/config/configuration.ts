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
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.CLAUDE_MODEL ?? 'claude-haiku-4-5-20251001',
  },
  openweather: {
    apiKey: process.env.OPENWEATHER_API_KEY ?? '',
    baseUrl: process.env.OPENWEATHER_BASE_URL ?? 'https://api.openweathermap.org/data/2.5',
  },
});
