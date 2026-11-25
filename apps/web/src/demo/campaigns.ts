// Pure campaign rules (DEMO-26, DEMO-27): CSV parsing, recipient checks and the message text.
// Used by the wizard to show reasons and by the demo api to check again before saving.
import type { CampaignRecipient, RecipientReason } from '@crm/shared';
import { isTestNumber } from './seed.ts';

export const MAX_CAMPAIGN_ROWS = 1000;
export const MAX_CAMPAIGN_MESSAGE = 1000;
// Simulated sending pace: one message every ~2 s (DEMO-27).
export const CAMPAIGN_STEP_MS = 2_000;

// RFC 4180-style: quoted fields, "" inside quotes, CRLF or LF line ends.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Blank lines are not rows.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export interface CsvRow {
  phone: string;
  name: string | null;
  // Every other column, for the Segment step.
  fields: Record<string, string>;
}

export type CsvResult =
  { ok: true; rows: CsvRow[]; columns: string[] } | { ok: false; error: string };

export function readCampaignCsv(text: string): CsvResult {
  const table = parseCsv(text.replace(/^﻿/, ''));
  const header = table[0];
  if (!header) return { ok: false, error: 'The file is empty.' };
  const names = header.map((h) => h.trim().toLowerCase());
  const phoneAt = names.indexOf('phone');
  if (phoneAt < 0) return { ok: false, error: 'The first row must have a "phone" column.' };
  const body = table.slice(1);
  if (body.length === 0) return { ok: false, error: 'The file has a header row but no contacts.' };
  if (body.length > MAX_CAMPAIGN_ROWS) {
    return {
      ok: false,
      error: `At most ${MAX_CAMPAIGN_ROWS.toLocaleString('en-IN')} rows per campaign.`,
    };
  }
  const nameAt = names.indexOf('name');
  const extra = names.filter((n, i) => i !== phoneAt && i !== nameAt && n !== '');
  const rows = body.map((cells) => {
    const fields: Record<string, string> = {};
    names.forEach((n, i) => {
      if (i !== phoneAt && i !== nameAt && n !== '') fields[n] = (cells[i] ?? '').trim();
    });
    const name = nameAt >= 0 ? (cells[nameAt] ?? '').trim() : '';
    return { phone: (cells[phoneAt] ?? '').trim(), name: name === '' ? null : name, fields };
  });
  return { ok: true, rows, columns: extra };
}

// "+1 (202) 555-0101" → "+12025550101"; null when it is not a full international number.
export function normalizePhone(raw: string): string | null {
  let p = raw.replace(/[\s().-]/g, '');
  if (p.startsWith('00')) p = `+${p.slice(2)}`;
  return /^\+[1-9]\d{7,14}$/.test(p) ? p : null;
}

export interface RecipientRules {
  testOnly: boolean;
  optedOut: ReadonlySet<string>;
}

// DEMO-26: every row gets a status; a skipped row always says why. Checked in this order:
// invalid number, duplicate, not a test number (while "Test numbers only" is on), opted out.
export function checkRecipients(rows: CsvRow[], rules: RecipientRules): CampaignRecipient[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const phone = normalizePhone(row.phone);
    const skip = (reason: RecipientReason, shown: string): CampaignRecipient => ({
      phone: shown,
      name: row.name,
      status: 'skipped',
      reason,
      at: null,
    });
    if (phone === null) return skip('invalid_phone', row.phone);
    if (seen.has(phone)) return skip('duplicate', phone);
    seen.add(phone);
    if (rules.testOnly && !isTestNumber(phone)) return skip('not_test_number', phone);
    if (rules.optedOut.has(phone)) return skip('opted_out', phone);
    return { phone, name: row.name, status: 'pending', reason: null, at: null };
  });
}

export const REASON_TEXT: Readonly<Record<RecipientReason, string>> = {
  invalid_phone: 'Not a valid phone number',
  duplicate: 'Duplicate of an earlier row',
  not_test_number: 'Not a test number ("Test numbers only" is on)',
  opted_out: 'On the opt-out list',
  wa_not_connected: 'WhatsApp was not connected',
};

export function renderMessage(template: string, name: string | null): string {
  return template.replace(/\{name\}/g, name ?? 'there');
}

export function campaignCounts(
  recipients: CampaignRecipient[],
): Record<CampaignRecipient['status'] | 'total', number> {
  const counts = { total: recipients.length, pending: 0, sent: 0, skipped: 0, failed: 0 };
  for (const r of recipients) counts[r.status] += 1;
  return counts;
}

// A ready-made file for the walk-through: test numbers plus one row of each problem.
export const SAMPLE_CSV = [
  'phone,name,interest,city',
  '+1 202 555 0101,Rahul Sharma,2 BHK,Bengaluru',
  '+1 202 555 0102,Meera Joshi,3 BHK,Bengaluru',
  '+1 202 555 0103,Arjun Reddy,2 BHK,Bengaluru',
  '+1 202 555 0105,Siddharth Rao,Villa,Bengaluru',
  '+1 202 555 0108,Aditya Kulkarni,2 BHK,Pune',
  '+1 202 555 0109,Nisha Patel,Plot,Bengaluru',
  '+1 202 555 0124,Farhan Ali,2 BHK,Bengaluru',
  '+91 98765 43210,Outside contact,2 BHK,Mumbai',
  '+1 202 555 0101,Rahul Sharma,2 BHK,Bengaluru',
  '"98765, ext 2",Bad number,3 BHK,Bengaluru',
].join('\n');
