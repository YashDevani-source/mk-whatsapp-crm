import { describe, it } from 'vitest';

// MSG placeholders (docs/specs/003-messaging.md). Phase 5 turns them into real tests.
describe('messages page', () => {
  it.todo(
    'MSG-24 ticks come only from the status; sender name or "Sent from phone"; unsupported label',
  );
  it.todo('MSG-25 Resend on a failed message sends its text as a new message');
  it.todo('MSG-28 real test phone: message in, reply out, real ticks, restart sends once (manual)');
});
