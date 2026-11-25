import { describe, it } from 'vitest';

// Placeholders until FND phase 5 turns them into real tests.
describe('socket auth and rooms', () => {
  it.todo('FND-15 a socket without a valid session is refused and with one it connects');
  it.todo('FND-16 a client join request is ignored and nothing from that room arrives');
  it.todo('FND-17 rooms are assigned by role and an Employee is never in inbox:all or admin');
  it.todo('FND-20 logout or deactivation disconnects the user sockets and stops room events');
});
