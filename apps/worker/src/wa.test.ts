import { describe, it } from 'vitest';

describe('WhatsApp connection manager', () => {
  it.todo(
    'WA-01 the worker uses the Fake provider by default, Baileys when set, and refuses any other value',
  );
  it.todo('WA-02 a second worker stays on standby while the lock is held');
  it.todo('WA-03 a standby takes over after the lock holder is killed');
  it.todo('WA-04 a worker that loses its lock closes the provider and publishes nothing more');
  it.todo('WA-05 SIGTERM closes the provider, releases the lock and exits 0');
  it.todo('WA-07 a paired session is stored without plaintext');
  it.todo(
    'WA-08 with no stored session the worker publishes connecting, qr_required and each QR, then connected',
  );
  it.todo('WA-09 with a stored session a restart connects without a QR');
  it.todo('WA-10 a credentials update is stored and loaded on restart');
  it.todo('WA-11 a network drop reconnects with exponential backoff');
  it.todo('WA-12 a logout from the phone deletes the session and does not reconnect');
  it.todo('WA-13 an expired QR stops in reconnect_required');
  it.todo('WA-14 an unreadable session gives reconnect_required and keeps the row');
});
