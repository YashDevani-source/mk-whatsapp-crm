import type { WaState } from '@crm/shared';
import { describe, expect, it } from 'vitest';
import { actionErrorText, bannerText, loginErrorText, viewFor } from './view.ts';

function state(s: WaState['state'], extra: Partial<WaState> = {}): WaState {
  return { v: 1, state: s, provider: 'baileys', at: '2026-11-25T12:00:00.000Z', ...extra };
}

describe('login page', () => {
  it('WA-23 a Super Admin lands on the connection page and the other roles on the home page', () => {
    expect(viewFor('SUPER_ADMIN')).toBe('connection');
    expect(viewFor('MANAGER')).toBe('home');
    expect(viewFor('EMPLOYEE')).toBe('home');
  });

  it('WA-23 every failed login shows the same message, and 429 a too-many-attempts message', () => {
    expect(loginErrorText(401)).toBe(loginErrorText(400));
    expect(loginErrorText(401)).toBe(loginErrorText(500));
    expect(loginErrorText(429)).not.toBe(loginErrorText(401));
    expect(loginErrorText(429)).toMatch(/too many/i);
  });

  it.todo('WA-23 login page in a browser (manual)');
});

describe('connection page', () => {
  it('WA-24 a refused action says why', () => {
    expect(actionErrorText(409)).toMatch(/state changed/i);
    expect(actionErrorText(403)).toMatch(/super admin/i);
    expect(actionErrorText(500)).toMatch(/500/);
  });

  it.todo('WA-24 connection page in a browser (manual)');
});

describe('connection banner', () => {
  it('WA-25 the banner is calm when connected and warns when disconnected or reconnect_required', () => {
    expect(bannerText(state('connected')).tone).toBe('ok');
    expect(bannerText(state('disconnected', { reason: 'network' })).tone).toBe('warn');
    expect(
      bannerText(state('reconnect_required', { reason: 'logged_out_from_phone' })),
    ).toMatchObject({
      tone: 'warn',
      text: expect.stringMatching(/logged out from the phone/i),
    });
    expect(bannerText(state('reconnect_required', { reason: 'qr_timeout' })).text).toMatch(
      /QR expired/i,
    );
  });

  it('WA-25 a worker that is not running is shown as offline', () => {
    const offline = bannerText({
      v: 1,
      state: 'disconnected',
      provider: null,
      reason: 'worker_offline',
      at: '2026-11-25T12:00:00.000Z',
    });
    expect(offline.tone).toBe('warn');
    expect(offline.text).toMatch(/offline/i);
    expect(offline.simulated).toBe(false);
  });

  it('WA-25 the fake provider is labelled simulated in every state, and Baileys never is', () => {
    for (const s of ['connecting', 'qr_required', 'connected', 'disconnected'] as const) {
      expect(bannerText(state(s, { provider: 'fake' })).simulated).toBe(true);
      expect(bannerText(state(s)).simulated).toBe(false);
    }
  });

  it('WA-25 before the first state arrives the banner says it is checking', () => {
    expect(bannerText(undefined)).toMatchObject({ tone: 'info', simulated: false });
  });
});

describe('real phone', () => {
  it.todo('WA-27 real test phone end to end (manual)');
});
