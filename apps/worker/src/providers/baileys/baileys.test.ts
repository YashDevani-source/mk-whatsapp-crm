import { WAMessageStatus } from 'baileys';
import { describe, expect, it } from 'vitest';
import {
  e164,
  messageContent,
  phoneJid,
  reportedStatus,
  senderPhone,
  timestampOf,
} from './helpers.ts';

// Fictional numbers only (+1 202 555 01xx).
const noLid = (): Promise<string | null> => Promise.resolve(null);

describe('Baileys message helpers', () => {
  it('MSG-27 a phone jid, with or without a device suffix, maps to E.164 and back', async () => {
    expect(e164('12025550101@s.whatsapp.net')).toBe('+12025550101');
    expect(e164('12025550101:12@s.whatsapp.net')).toBe('+12025550101');
    expect(e164(undefined)).toBeUndefined();
    expect(phoneJid('+12025550101')).toBe('12025550101@s.whatsapp.net');
    expect(await senderPhone({ remoteJid: '12025550101:3@s.whatsapp.net' }, noLid)).toEqual({
      phone: '+12025550101',
    });
  });

  it('MSG-27 a LID jid uses the phone alternative, then the mapping, and is skipped with neither', async () => {
    const lid = '123456789012345@lid';
    expect(
      await senderPhone({ remoteJid: lid, remoteJidAlt: '12025550102@s.whatsapp.net' }, noLid),
    ).toEqual({ phone: '+12025550102' });
    expect(
      await senderPhone({ remoteJid: lid }, (l) =>
        Promise.resolve(l === lid ? '12025550103:7@s.whatsapp.net' : null),
      ),
    ).toEqual({ phone: '+12025550103' });
    expect(await senderPhone({ remoteJid: lid }, noLid)).toEqual({ skip: 'unknown_sender' });
    // A failing lookup is "unknown", never a crash or a guess.
    expect(await senderPhone({ remoteJid: lid }, () => Promise.reject(new Error('x')))).toEqual({
      skip: 'unknown_sender',
    });
  });

  it('MSG-27 group, broadcast, status and channel jids are skipped with their reason', async () => {
    const cases = [
      ['120363012345678901@g.us', 'group'],
      ['1234567890@broadcast', 'broadcast'],
      ['status@broadcast', 'status'],
      ['120363098765432101@newsletter', 'channel'],
      [null, 'unknown_sender'],
      ['something@unknown.server', 'unknown_sender'],
    ] as const;
    for (const [remoteJid, skip] of cases) {
      expect(await senderPhone({ remoteJid }, noLid), String(remoteJid)).toEqual({ skip });
    }
  });

  it('MSG-27 text content maps to text, media to an unsupported kind, protocol and reactions to nothing', () => {
    expect(messageContent({ conversation: 'hello' })).toEqual({ kind: 'text', text: 'hello' });
    expect(messageContent({ extendedTextMessage: { text: 'with a link' } })).toEqual({
      kind: 'text',
      text: 'with a link',
    });
    // Disappearing-message wrapper.
    expect(messageContent({ ephemeralMessage: { message: { conversation: 'inner' } } })).toEqual({
      kind: 'text',
      text: 'inner',
    });
    const kinds = {
      imageMessage: 'image',
      videoMessage: 'video',
      audioMessage: 'audio',
      documentMessage: 'document',
      stickerMessage: 'sticker',
      locationMessage: 'location',
      contactMessage: 'contact',
    } as const;
    for (const [field, kind] of Object.entries(kinds)) {
      expect(messageContent({ [field]: {} }), field).toEqual({
        kind: 'unsupported',
        unsupportedKind: kind,
      });
    }
    expect(
      messageContent({ documentWithCaptionMessage: { message: { documentMessage: {} } } }),
    ).toEqual({ kind: 'unsupported', unsupportedKind: 'document' });
    for (const ignored of [
      { reactionMessage: { text: '👍' } },
      { protocolMessage: { type: 0 } },
      { editedMessage: { message: { protocolMessage: { type: 14 } } } },
      { pollUpdateMessage: {} },
      {},
      null,
      undefined,
    ]) {
      expect(messageContent(ignored), JSON.stringify(ignored)).toBeUndefined();
    }
  });

  it('MSG-27 Baileys status codes map to sent, delivered, read or failed', () => {
    expect(reportedStatus(WAMessageStatus.SERVER_ACK)).toBe('sent');
    expect(reportedStatus(WAMessageStatus.DELIVERY_ACK)).toBe('delivered');
    expect(reportedStatus(WAMessageStatus.READ)).toBe('read');
    expect(reportedStatus(WAMessageStatus.PLAYED)).toBe('read');
    expect(reportedStatus(WAMessageStatus.ERROR)).toBe('failed');
    expect(reportedStatus(WAMessageStatus.PENDING)).toBeUndefined();
    expect(reportedStatus(null)).toBeUndefined();
    expect(reportedStatus(99)).toBeUndefined();
  });

  it('MSG-27 WhatsApp timestamps in seconds become dates', () => {
    expect(timestampOf(1_764_064_800).toISOString()).toBe('2025-11-25T10:00:00.000Z');
    expect(Math.abs(timestampOf(null).getTime() - Date.now())).toBeLessThan(1_000);
  });
});
