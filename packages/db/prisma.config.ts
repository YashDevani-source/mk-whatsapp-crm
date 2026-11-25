import { defineConfig } from 'prisma/config';

// The URL is only needed by migrate and the client at runtime. `prisma generate` runs without it
// (postinstall, CI), so an unset URL is passed through as undefined instead of failing here.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] },
});
