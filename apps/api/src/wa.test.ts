import { describe, it } from 'vitest';

describe('WhatsApp events, routes and origin checks', () => {
  it.todo('WA-15 wa.state reaches every role and wa.qr only the Super Admin');
  it.todo('WA-16 a new socket receives the current state, and the Super Admin the current QR');
  it.todo('WA-17 an invalid event is dropped and nothing is pushed');
  it.todo('WA-18 POST /wa/qr asks the worker for a new QR only in reconnect_required');
  it.todo('WA-19 POST /wa/logout asks the worker to log out only when connected');
  it.todo('WA-20 WhatsApp actions write audit rows without QR or credentials');
  it.todo('WA-21 a socket handshake from a foreign origin is refused');
  it.todo('WA-22 a non-GET request from a foreign origin gets 403 and no CORS headers are sent');
});
