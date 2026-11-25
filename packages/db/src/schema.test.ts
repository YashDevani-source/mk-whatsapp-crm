import { beforeAll, describe, expect, it } from 'vitest';
import {
  TABLES,
  count,
  migrationFolders,
  query,
  resetDatabase,
  runScript,
  truncateAll,
} from './test-support.ts';

// Needs `docker compose up -d --wait`. Uses crm_test only (BOOT-10).
describe('pnpm migrate', () => {
  it('FND-04 pnpm migrate creates the six tables on crm_test and a second run applies nothing', async () => {
    await resetDatabase();

    const first = runScript('migrate');
    expect(first.status, first.output).toBe(0);
    const tables = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
       ORDER BY table_name`,
    );
    expect(tables.map((t) => t.table_name)).toEqual([...TABLES]);
    const applied = await count('_prisma_migrations', 'finished_at IS NOT NULL');
    expect(applied).toBe(migrationFolders().length);
    expect(applied).toBeGreaterThan(0);

    const second = runScript('migrate');
    expect(second.status, second.output).toBe(0);
    expect(await count('_prisma_migrations')).toBe(applied);
  });
});

// Raw SQL only, so no application code can mask a missing constraint (FND-05 edge case).
describe('unique constraints', () => {
  beforeAll(async () => {
    const r = runScript('migrate');
    expect(r.status, r.output).toBe(0);
    await truncateAll();
  });

  const insertUser = (email: string): Promise<unknown> =>
    query(`INSERT INTO users (id, email, name, password_hash, role)
           VALUES (gen_random_uuid(), '${email}', 'Test', 'x', 'EMPLOYEE')`);
  const insertContact = (phone: string): Promise<Array<{ id: string }>> =>
    query(`INSERT INTO contacts (id, phone) VALUES (gen_random_uuid(), '${phone}') RETURNING id`);
  const insertConversation = (contactId: string): Promise<Array<{ id: string }>> =>
    query(`INSERT INTO conversations (id, contact_id)
           VALUES (gen_random_uuid(), '${contactId}') RETURNING id`);
  const insertMessage = (conversationId: string, providerId: string | null): Promise<unknown> =>
    query(`INSERT INTO messages (id, conversation_id, provider_message_id, direction)
           VALUES (gen_random_uuid(), '${conversationId}',
                   ${providerId === null ? 'NULL' : `'${providerId}'`}, 'INBOUND')`);

  async function newConversation(phone: string): Promise<string> {
    const [contact] = await insertContact(phone);
    const [conversation] = await insertConversation(contact?.id ?? '');
    return conversation?.id ?? '';
  }

  const uniqueViolation = (constraint: string): object => ({ code: '23505', constraint });

  it('FND-05 a duplicate user email is a unique-constraint error', async () => {
    await insertUser('dup@crm.test');
    await expect(insertUser('dup@crm.test')).rejects.toMatchObject(
      uniqueViolation('users_email_key'),
    );
  });

  it('FND-05 a duplicate contact phone is a unique-constraint error', async () => {
    await insertContact('+12025550190');
    await expect(insertContact('+12025550190')).rejects.toMatchObject(
      uniqueViolation('contacts_phone_key'),
    );
  });

  it('FND-05 a second conversation for the same contact is a unique-constraint error', async () => {
    const [contact] = await insertContact('+12025550191');
    await insertConversation(contact?.id ?? '');
    await expect(insertConversation(contact?.id ?? '')).rejects.toMatchObject(
      uniqueViolation('conversations_contact_id_key'),
    );
  });

  it('FND-05 a duplicate non-null provider message ID is a unique-constraint error', async () => {
    const conversationId = await newConversation('+12025550192');
    await insertMessage(conversationId, 'wamid.dup');
    await expect(insertMessage(conversationId, 'wamid.dup')).rejects.toMatchObject(
      uniqueViolation('messages_provider_message_id_key'),
    );
  });

  it('FND-05 two messages with no provider message ID are both accepted', async () => {
    const conversationId = await newConversation('+12025550193');
    await insertMessage(conversationId, null);
    await insertMessage(conversationId, null);
    expect(
      await count(
        'messages',
        `conversation_id = '${conversationId}' AND provider_message_id IS NULL`,
      ),
    ).toBe(2);
  });
});
