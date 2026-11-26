// The provider's credentials and keys in Postgres, encrypted (WA-06, WA-07, WA-10). One session
// row per provider, so switching WHATSAPP_PROVIDER never loads the other provider's session.
import type { Db } from '@crm/db';
import type { ProviderAuthStore, ProviderKeyEntry, WaProviderName } from '@crm/shared';
import { DecryptError, decrypt, encrypt } from './crypto.ts';

// A stored value that cannot be decrypted (wrong key, tampered row). Never carries the value.
export class SessionUnreadable extends Error {
  override name = 'SessionUnreadable';
}

export interface SessionStore extends ProviderAuthStore {
  hasSession(): Promise<boolean>;
  // Deletes the session and its keys (logout, fresh pairing).
  clear(): Promise<void>;
  recordNumber(number: string): Promise<void>;
}

const PROVIDER = { fake: 'FAKE', baileys: 'BAILEYS' } as const;

export function createSessionStore(db: Db, key: Buffer, provider: WaProviderName): SessionStore {
  const where = { provider: PROVIDER[provider] };
  const credsAad = `wa:${provider}:creds`;
  const keyAad = (type: string, id: string): string => `wa:${provider}:key:${type}:${id}`;

  const open = (value: string, aad: string): string => {
    try {
      return decrypt(key, value, aad);
    } catch (error) {
      if (error instanceof DecryptError) throw new SessionUnreadable(error.message);
      throw error;
    }
  };
  const sessionId = async (): Promise<string | undefined> =>
    (await db.whatsAppSession.findUnique({ where, select: { id: true } }))?.id;

  return {
    hasSession: async () => (await sessionId()) !== undefined,

    loadCreds: async () => {
      const row = await db.whatsAppSession.findUnique({ where, select: { encryptedCreds: true } });
      return row ? open(row.encryptedCreds, credsAad) : undefined;
    },

    saveCreds: async (value) => {
      const encryptedCreds = encrypt(key, value, credsAad);
      await db.whatsAppSession.upsert({
        where,
        create: { ...where, encryptedCreds },
        update: { encryptedCreds },
      });
    },

    getKeys: async (type, ids) => {
      const id = await sessionId();
      if (id === undefined || ids.length === 0) return {};
      const rows = await db.whatsAppSessionKey.findMany({
        where: { sessionId: id, type, keyId: { in: [...ids] } },
        select: { keyId: true, encryptedValue: true },
      });
      const out: Record<string, string> = {};
      for (const row of rows) out[row.keyId] = open(row.encryptedValue, keyAad(type, row.keyId));
      return out;
    },

    // Adapters save the credentials first, so the session row exists before any key.
    setKeys: async (entries: readonly ProviderKeyEntry[]) => {
      if (entries.length === 0) return;
      const id = await sessionId();
      if (id === undefined) throw new Error('setKeys called before saveCreds');
      await db.$transaction(
        entries.map((e) => {
          const unique = { sessionId: id, type: e.type, keyId: e.id };
          if (e.value === null) return db.whatsAppSessionKey.deleteMany({ where: unique });
          const encryptedValue = encrypt(key, e.value, keyAad(e.type, e.id));
          return db.whatsAppSessionKey.upsert({
            where: { sessionId_type_keyId: unique },
            create: { ...unique, encryptedValue },
            update: { encryptedValue },
          });
        }),
      );
    },

    clear: async () => {
      await db.whatsAppSession.deleteMany({ where });
    },

    recordNumber: async (number) => {
      await db.whatsAppSession.updateMany({ where, data: { number } });
    },
  };
}
