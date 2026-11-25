import { describe, it } from 'vitest';

// MSG placeholders (docs/specs/003-messaging.md). Phase 3 turns them into real tests.
describe('message routes', () => {
  it.todo(
    'MSG-08 conversations are listed newest first and messages oldest first; unknown ids give 404',
  );
  it.todo(
    'MSG-09 a send stores a queued message, adds its job with the message id, pushes it and returns 202',
  );
  it.todo(
    'MSG-10 an empty, too long or unknown-field send gets 400; an unknown conversation 404; nothing stored',
  );
  it.todo(
    'MSG-11 a send while WhatsApp is not connected gets 503 wa_not_connected; nothing stored',
  );
  it.todo('MSG-12 an Employee gets 403 on every message route; nothing stored');
  it.todo('MSG-13 a repeated clientId returns the existing message and queues nothing new');
});

describe('message events', () => {
  it.todo('MSG-23 message events reach inbox:all only; the Employee receives none');
});

describe('logs', () => {
  it.todo('MSG-26 no api log line contains a message body or a full phone number');
});
