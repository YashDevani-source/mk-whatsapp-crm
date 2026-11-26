import { Role, SeedEnv, formatEnvProblems, parseEnv } from '@crm/shared';
import argon2 from 'argon2';
import { createDb } from './client.ts';

// FND-06: one active user per role and a few test contacts. Every user gets SEED_PASSWORD (the
// documented dev default unless set). Upserts never update, so a second run changes nothing.
const SEED_USERS: Readonly<Record<Role, { email: string; name: string }>> = {
  SUPER_ADMIN: { email: 'superadmin@crm.test', name: 'Seed Super Admin' },
  MANAGER: { email: 'manager@crm.test', name: 'Seed Manager' },
  EMPLOYEE: { email: 'employee@crm.test', name: 'Seed Employee' },
};

// Fictional numbers (555-0100 to 555-0199 are reserved for fiction).
const SEED_CONTACTS = [
  { phone: '+12025550101', name: 'Test Contact 1' },
  { phone: '+12025550102', name: 'Test Contact 2' },
] as const;

const parsed = parseEnv(SeedEnv, process.env);
if (!parsed.ok) {
  console.error(formatEnvProblems('seed', parsed.problems));
  process.exit(1);
}
const env = parsed.env;

// Checked before connecting, so a production database is never touched.
if (env.NODE_ENV === 'production') {
  console.error('seed: refusing to run with NODE_ENV=production');
  process.exit(1);
}

const db = createDb(env.DATABASE_URL);
try {
  for (const role of Role.options) {
    const { email, name } = SEED_USERS[role];
    const passwordHash = await argon2.hash(env.SEED_PASSWORD);
    await db.user.upsert({
      where: { email },
      create: { email, name, role, passwordHash },
      update: {},
    });
  }
  for (const contact of SEED_CONTACTS) {
    await db.contact.upsert({
      where: { phone: contact.phone },
      create: { ...contact, isTest: true },
      update: {},
    });
  }
} finally {
  await db.$disconnect();
}
console.log(`seed: ${Role.options.length} users, ${SEED_CONTACTS.length} test contacts`);
