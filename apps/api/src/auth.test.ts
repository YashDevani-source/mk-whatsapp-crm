import { describe, it } from 'vitest';

// Placeholders until FND phase 4 turns them into real tests.
describe('auth routes', () => {
  it.todo(
    'FND-07 login sets an httpOnly SameSite cookie, stores a Redis session, returns id name role',
  );
  it.todo('FND-08 wrong password, unknown email and deactivated user return the same 401');
  it.todo('FND-09 repeated failed logins for one email return 429 without affecting other emails');
  it.todo('FND-10 logout deletes the Redis session and the old cookie returns 401');
  it.todo('FND-11 a user set inactive is rejected with 401 on the next request');
  it.todo('FND-18 passwords are stored as argon2 hashes and never appear in responses or logs');
});
