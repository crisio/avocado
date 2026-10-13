import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations')
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            EMAIL_MODE: 'log',
            AUTH_SECRET: 'test-secret-de-al-menos-32-caracteres!',
            OPENROUTER_API_KEY: 'test-key',
            AI_MODELS: 'test/vision-model',
            REVIEW_EMAIL: 'Revision@Avocado.test',
            REVIEW_CODE: '246810',
          },
        },
      }),
    ],
    test: { setupFiles: ['./test/setup.ts'] },
  }
})
