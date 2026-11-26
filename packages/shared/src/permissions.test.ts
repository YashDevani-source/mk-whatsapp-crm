import { describe, expect, it } from 'vitest';
import { PERMISSION_MAP, Permission, Role, can } from './auth.ts';

const ROLES = Role.options;
const granted = (role: Role): readonly Permission[] => PERMISSION_MAP[role];
const heldByAll = Permission.options.filter((p) => ROLES.every((r) => can(r, p)));
const superAdminOnly = Permission.options.filter(
  (p) => can('SUPER_ADMIN', p) && ROLES.filter((r) => r !== 'SUPER_ADMIN').every((r) => !can(r, p)),
);

describe('permission map', () => {
  it('FND-12 every role has an entry, every permission is granted, Employee and Manager are limited', () => {
    expect(Object.keys(PERMISSION_MAP).sort()).toEqual([...ROLES].sort());
    for (const permission of Permission.options) {
      expect(
        ROLES.some((r) => can(r, permission)),
        permission,
      ).toBe(true);
    }

    // Employee: only what every logged-in user has. Manager: nothing reserved for Super Admin.
    expect(granted('EMPLOYEE').filter((p) => !heldByAll.includes(p))).toEqual([]);
    expect(granted('MANAGER').filter((p) => superAdminOnly.includes(p))).toEqual([]);

    // The FND set (Decision 7), so the rules above cannot pass on an empty or flat map.
    expect(heldByAll).toEqual(['auth.session']);
    expect(superAdminOnly).toEqual(['wa.manage']);
    expect(can('MANAGER', 'users.manage')).toBe(true);
    expect(can('EMPLOYEE', 'users.manage')).toBe(false);
  });
});
