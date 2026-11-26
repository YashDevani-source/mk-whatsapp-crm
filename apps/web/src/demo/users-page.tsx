// DEMO-29: users. Add, change role, deactivate (history kept). The demo api enforces the limits:
// a Manager cannot create, promote to or change a Super Admin; nobody deactivates themself or
// the last Super Admin.
import { Role, type UserView } from '@crm/shared';
import { useState } from 'react';
import { useDemo, useLive, useUser } from './context.tsx';
import { countOf, formatDateTime } from './format.ts';
import { DEMO_PASSWORD } from './seed.ts';
import { useToast } from './toasts.tsx';
import {
  Avatar,
  Chip,
  ErrorNote,
  errorText,
  Modal,
  PageHeader,
  ROLE_LABELS,
  RoleBadge,
  Skeleton,
  StatStrip,
} from './ui.tsx';

export function UsersPage() {
  const { api } = useDemo();
  const me = useUser();
  const toast = useToast();
  const users = useLive((a) => a.listUsers(), 'users');
  const [adding, setAdding] = useState(false);
  const [deactivating, setDeactivating] = useState<UserView>();
  const admin = me.role === 'SUPER_ADMIN';

  async function run(action: () => Promise<void>, done: string): Promise<void> {
    try {
      await action();
      toast({ tone: 'ok', title: done });
    } catch (err) {
      toast({ tone: 'error', title: errorText(err) });
    }
  }

  // What this user may do to that one; the demo api checks the same.
  const locked = (u: UserView): boolean =>
    !u.active || u.id === me.id || (!admin && u.role === 'SUPER_ADMIN');
  const roles = Role.options.filter((r) => admin || r !== 'SUPER_ADMIN');

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={
          users.data
            ? `${countOf(users.data.filter((u) => u.active).length, 'active person', 'active people')}. Deactivating keeps history: past messages keep the person’s name.`
            : 'Who can log in, and with which role.'
        }
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            Add user
          </button>
        }
      />
      {users.data && (
        <StatStrip
          label="Users by role"
          stats={[
            {
              key: 'admin',
              label: 'Super Admin',
              value: users.data.filter((u) => u.active && u.role === 'SUPER_ADMIN').length,
              hint: 'Runs the WhatsApp number',
              tone: 'neutral',
            },
            {
              key: 'manager',
              label: 'Managers',
              value: users.data.filter((u) => u.active && u.role === 'MANAGER').length,
              hint: 'Assign and oversee',
              tone: 'neutral',
            },
            {
              key: 'employee',
              label: 'Employees',
              value: users.data.filter((u) => u.active && u.role === 'EMPLOYEE').length,
              hint: 'Reply to customers',
              tone: 'neutral',
            },
            {
              key: 'inactive',
              label: 'Deactivated',
              value: users.data.filter((u) => !u.active).length,
              hint: 'History kept',
              tone: 'grey',
            },
          ]}
        />
      )}
      {users.loading && <Skeleton rows={6} />}
      {users.error !== undefined && <ErrorNote error={users.error} />}
      {users.data && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Added</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id} className={u.active ? '' : 'inactive-row'}>
                  <td>
                    <span className="who">
                      <Avatar name={u.name} size="sm" />
                      <strong>{u.name}</strong>
                      {u.id === me.id && <span className="muted small">(you)</span>}
                    </span>
                  </td>
                  <td className="muted">{u.email}</td>
                  <td>
                    {locked(u) ? (
                      <RoleBadge role={u.role} />
                    ) : (
                      <select
                        value={u.role}
                        aria-label={`Role of ${u.name}`}
                        onChange={(e) =>
                          void run(
                            () => api.changeRole(u.id, e.target.value as Role),
                            `${u.name} is now ${ROLE_LABELS[e.target.value as Role]}`,
                          )
                        }
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>{u.active ? <Chip tone="ok">Active</Chip> : <Chip>Deactivated</Chip>}</td>
                  <td className="muted">{formatDateTime(u.createdAt)}</td>
                  <td className="row-actions">
                    {!locked(u) && (
                      <button
                        type="button"
                        className="btn btn-small btn-danger"
                        onClick={() => setDeactivating(u)}
                      >
                        Deactivate…
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && <AddUserModal roles={roles} onClose={() => setAdding(false)} />}
      {deactivating && (
        <Modal
          title={`Deactivate ${deactivating.name}?`}
          onClose={() => setDeactivating(undefined)}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setDeactivating(undefined)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  const target = deactivating;
                  setDeactivating(undefined);
                  void run(() => api.deactivateUser(target.id), `${target.name} deactivated`);
                }}
              >
                Deactivate
              </button>
            </>
          }
        >
          <p>History is kept: their past messages and changes keep their name.</p>
          <p>Their open chats and leads become unassigned, and they are logged out at once.</p>
        </Modal>
      )}
    </>
  );
}

function AddUserModal({ roles, onClose }: { roles: Role[]; onClose: () => void }) {
  const { api } = useDemo();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('EMPLOYEE');
  const [error, setError] = useState<string>();

  async function save(): Promise<void> {
    try {
      const user = await api.createUser({ name, email, role });
      toast({
        tone: 'ok',
        title: `${user.name} added`,
        body: `Log in with ${user.email} / ${DEMO_PASSWORD}`,
      });
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Modal
      title="Add user"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={name.trim() === '' || email.trim() === ''}
            onClick={() => void save()}
          >
            Add
          </button>
        </>
      }
    >
      <div className="form">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@skyline.test"
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          New users log in with the demo password {DEMO_PASSWORD}. Emails must be unique.
        </p>
        {error && <p className="error-note">{error}</p>}
      </div>
    </Modal>
  );
}
