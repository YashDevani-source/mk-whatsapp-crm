import { describe, it } from 'vitest';

// Placeholders until FND phase 4 turns them into real tests.
describe('route access', () => {
  it.todo(
    'FND-13 every route declares public or a permission, and only health and login are public',
  );
  it.todo('FND-14 a protected route returns 401 without a session and 403 for the wrong role');
});
