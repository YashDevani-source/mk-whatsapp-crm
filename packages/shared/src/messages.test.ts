import { describe, expect, it } from 'vitest';
import { MessageStatus, ReportedStatus, nextStatus } from './messages.ts';

// The spec's table (docs/specs/003-messaging.md, Contracts touched), row by row. null is "no change".
const TABLE: Record<MessageStatus, Record<ReportedStatus, MessageStatus | null>> = {
  queued: { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' },
  sent: { sent: null, delivered: 'delivered', read: 'read', failed: 'failed' },
  delivered: { sent: null, delivered: null, read: 'read', failed: null },
  read: { sent: null, delivered: null, read: null, failed: null },
  failed: { sent: null, delivered: null, read: null, failed: null },
};

describe('message status rule', () => {
  it('MSG-20 nextStatus follows the forward-only table for every current and reported status', () => {
    let pairs = 0;
    for (const current of MessageStatus.options) {
      for (const reported of ReportedStatus.options) {
        expect(nextStatus(current, reported), `${current} + ${reported}`).toBe(
          TABLE[current][reported],
        );
        pairs += 1;
      }
    }
    expect(pairs).toBe(20);
  });

  it('MSG-20 no sequence of reports ever moves a status backward', () => {
    const rank = (s: MessageStatus): number => MessageStatus.options.indexOf(s);
    for (const start of MessageStatus.options) {
      for (const a of ReportedStatus.options) {
        for (const b of ReportedStatus.options) {
          let s = start;
          for (const r of [a, b]) {
            const next = nextStatus(s, r);
            if (next !== null) {
              expect(rank(next)).toBeGreaterThan(rank(s));
              s = next;
            }
          }
        }
      }
    }
  });
});
