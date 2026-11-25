// WA-01: picks the adapter. Baileys is loaded only when selected, so Fake runs never load it.
import type { WaProviderName, WhatsAppProvider } from '@crm/shared';
import { FakeProvider } from './fake/fake.ts';

// In `pnpm dev` the Fake shows its simulated QR for this long, then pairs itself.
export const FAKE_AUTO_PAIR_MS = 5_000;

export async function createProvider(name: WaProviderName): Promise<WhatsAppProvider> {
  if (name === 'baileys') {
    const { BaileysProvider } = await import('./baileys/index.ts');
    return new BaileysProvider();
  }
  return new FakeProvider({ autoPairMs: FAKE_AUTO_PAIR_MS });
}
