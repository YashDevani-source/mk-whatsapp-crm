import { describe, it } from 'vitest';

// MSG placeholders (docs/specs/003-messaging.md). Phase 2 (inbound) and phase 4 (sending and
// status) turn them into real tests.
describe('inbound messages', () => {
  it.todo(
    'MSG-01 a text from a new number creates one contact, one conversation and one inbound message',
  );
  it.todo(
    'MSG-02 a later message reuses the contact and conversation and never moves lastMessageAt back',
  );
  it.todo('MSG-03 the same provider message reported twice is stored once and published once');
  it.todo(
    'MSG-04 group, broadcast, status, channel and unknown-sender messages store and publish nothing',
  );
  it.todo(
    'MSG-05 inbound media is stored as unsupported with its kind; protocol messages store nothing',
  );
  it.todo('MSG-06 a message typed on the company phone is stored outbound with no sender');
  it.todo(
    'MSG-07 only the lock holder handles messages and statuses, and only from its current connection',
  );
});

describe('sending', () => {
  it.todo('MSG-14 the send job sends through the provider, saves the provider id and sets sent');
  it.todo('MSG-15 a job whose message is not queued sends nothing; the same job twice sends once');
  it.todo('MSG-16 a failing send is retried 3 times, then marked failed with a reason');
  it.todo(
    'MSG-17 a CRM-sent message is stored once even when the provider reports it back as from-me',
  );
  it.todo('MSG-18 only the lock holder takes send jobs; the next holder sends a stalled job once');
  it.todo('MSG-19 send jobs run one at a time, in queue order');
});

describe('status', () => {
  it.todo(
    'MSG-21 a status report applies nextStatus and publishes only on a change; unknown ids change nothing',
  );
  it.todo('MSG-22 the CRM never sets delivered or read itself; a dev Fake send stays at sent');
});

describe('logs', () => {
  it.todo('MSG-26 no worker log line contains a message body or a full phone number');
});
