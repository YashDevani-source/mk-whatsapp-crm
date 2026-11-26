import type { ConversationSummary, MessageStatusUpdate, MessageView } from '@crm/shared';
import { describe, expect, it } from 'vitest';
import {
  addMessage,
  applyStatus,
  bodyText,
  contactLabel,
  resendText,
  sendErrorText,
  senderLabel,
  tickFor,
  upsertConversation,
} from './messages-view.ts';
import { tabsFor } from './view.ts';

const CONV = '11111111-1111-4111-8111-111111111111';

function message(extra: Partial<MessageView> = {}): MessageView {
  return {
    v: 1,
    id: crypto.randomUUID(),
    conversationId: CONV,
    direction: 'outbound',
    type: 'text',
    body: 'hello',
    unsupportedKind: null,
    status: 'sent',
    failureReason: null,
    sender: { id: '22222222-2222-4222-8222-222222222222', name: 'Meera' },
    at: '2026-11-25T10:00:00.000Z',
    ...extra,
  };
}

function update(messageId: string, status: MessageStatusUpdate['status']): MessageStatusUpdate {
  return {
    v: 1,
    messageId,
    conversationId: CONV,
    status,
    failureReason: status === 'failed' ? 'reported_failed' : null,
    at: '2026-11-25T10:01:00.000Z',
  };
}

describe('messages page', () => {
  it('MSG-24 ticks come only from the status, and inbound messages have none', () => {
    expect(tickFor(message({ status: 'queued' }))).toMatchObject({ symbol: '🕓', tone: 'muted' });
    expect(tickFor(message({ status: 'sent' }))).toMatchObject({ symbol: '✓', label: 'Sent' });
    expect(tickFor(message({ status: 'delivered' }))).toMatchObject({
      symbol: '✓✓',
      tone: 'muted',
    });
    expect(tickFor(message({ status: 'read' }))).toMatchObject({ symbol: '✓✓', tone: 'read' });
    expect(tickFor(message({ status: 'failed', failureReason: 'wa_not_connected' }))).toMatchObject(
      { tone: 'failed', label: expect.stringMatching(/not connected/i) },
    );
    expect(tickFor(message({ direction: 'inbound', status: null, sender: null }))).toBeUndefined();
  });

  it('MSG-24 outbound messages show the sender or "Sent from phone"; unsupported messages say so', () => {
    expect(senderLabel(message())).toBe('Meera');
    expect(senderLabel(message({ sender: null }))).toBe('Sent from phone');
    expect(senderLabel(message({ direction: 'inbound', sender: null, status: null }))).toBe(
      undefined,
    );
    expect(bodyText(message({ type: 'unsupported', body: null, unsupportedKind: 'image' }))).toBe(
      'Unsupported message (image)',
    );
    expect(bodyText(message({ body: 'hi there' }))).toBe('hi there');
    expect(contactLabel({ id: CONV, phone: '+12025550101', name: null })).toBe('+12025550101');
    expect(contactLabel({ id: CONV, phone: '+12025550101', name: 'Asha' })).toBe(
      'Asha (+12025550101)',
    );
  });

  it('MSG-24 a tick never moves backward, even when updates arrive out of order', () => {
    const m = message({ status: 'queued' });
    let list = addMessage([], m);
    list = applyStatus(list, update(m.id, 'read'));
    list = applyStatus(list, update(m.id, 'delivered'));
    list = applyStatus(list, update(m.id, 'sent'));
    expect(list[0]?.status).toBe('read');
    // Inbound messages never get a status.
    const inbound = message({ direction: 'inbound', status: null, sender: null });
    expect(applyStatus([inbound], update(inbound.id, 'read'))[0]?.status).toBeNull();
  });

  it('MSG-24 a message delivered by both the send response and the socket is shown once, in order', () => {
    const later = message({ at: '2026-11-25T10:05:00.000Z' });
    const earlier = message({ at: '2026-11-25T09:00:00.000Z' });
    let list = addMessage([], later);
    list = addMessage(list, earlier);
    list = addMessage(list, later);
    expect(list.map((m) => m.id)).toEqual([earlier.id, later.id]);
  });

  it('MSG-24 conversations stay newest first and an update replaces the old row', () => {
    const summary = (id: string, at: string): ConversationSummary => ({
      v: 1,
      id,
      contact: { id, phone: '+12025550101', name: null },
      lastMessageAt: at,
      lastMessage: null,
    });
    const a = summary('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-11-25T09:00:00.000Z');
    const b = summary('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-11-25T10:00:00.000Z');
    let list = upsertConversation(upsertConversation([], a), b);
    expect(list.map((c) => c.id)).toEqual([b.id, a.id]);
    list = upsertConversation(list, { ...a, lastMessageAt: '2026-11-25T11:00:00.000Z' });
    expect(list.map((c) => c.id)).toEqual([a.id, b.id]);
  });

  it('MSG-24 a send error says why', () => {
    expect(sendErrorText(503, 'wa_not_connected')).toMatch(/not connected/i);
    expect(sendErrorText(503, 'queue_unavailable')).toMatch(/could not be queued/i);
    expect(sendErrorText(400)).toMatch(/4096/);
    expect(sendErrorText(403)).toMatch(/not allowed/i);
  });

  it('MSG-24 the messages page is for the Super Admin and Managers only', () => {
    expect(tabsFor('SUPER_ADMIN')).toEqual(['connection', 'messages']);
    expect(tabsFor('MANAGER')).toEqual(['messages']);
    expect(tabsFor('EMPLOYEE')).toEqual(['home']);
  });

  it('MSG-25 only a failed text offers Resend, with its own text', () => {
    expect(resendText(message({ status: 'failed', body: 'try again' }))).toBe('try again');
    for (const status of ['queued', 'sent', 'delivered', 'read'] as const) {
      expect(resendText(message({ status }))).toBeUndefined();
    }
    expect(
      resendText(
        message({ status: 'failed', type: 'unsupported', body: null, unsupportedKind: 'x' }),
      ),
    ).toBeUndefined();
  });

  it.todo('MSG-24 messages page in a browser (manual)');
  it.todo('MSG-28 real test phone: message in, reply out, real ticks, restart sends once (manual)');
});
