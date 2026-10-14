import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests need a Postgres they may create/drop schemas in. Default
    // matches the docker command in .env.example; override via the environment.
    env: {
      TEST_DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:localdev@127.0.0.1:5433/budget_test',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
