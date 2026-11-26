// DEMO-24: projects and units, the detail page with gallery, brochures and upload, and the
// "Share into chat" modal (also opened from the inbox composer).
import { PropertyType, type MediaFile, type ProjectView } from '@crm/shared';
import { useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router';
import { demoCan } from './access.ts';
import { useDemo, useLive, useUser } from './context.tsx';
import { countOf, formatPhone, formatPrice } from './format.ts';
import { placeholderImage, propertyCard, uploadProblem } from './rules.ts';
import { useToast } from './toasts.tsx';
import {
  Chip,
  Empty,
  errorText,
  ErrorNote,
  Modal,
  PageHeader,
  Skeleton,
  StatStrip,
  Tag,
  type Tone,
} from './ui.tsx';

const UNIT_TONE: Record<string, Tone> = { available: 'ok', reserved: 'warn', sold: 'neutral' };

export function PropertiesPage() {
  const id = useParams()['*'] || undefined;
  return id ? <ProjectDetail key={id} id={id} /> : <ProjectList />;
}

function fromPrice(p: ProjectView): number | null {
  const prices = p.units.filter((u) => u.status === 'available').map((u) => u.price);
  return prices.length > 0 ? Math.min(...prices) : null;
}

function photoSrc(project: ProjectView, media: MediaFile, n: number): string {
  return media.url ?? placeholderImage(`${project.name} · ${n + 1}`, `${project.id}-${n}`);
}

const unitCount = (list: ProjectView[], status: ProjectView['units'][number]['status']): number =>
  list.reduce((n, p) => n + p.units.filter((u) => u.status === status).length, 0);

function ProjectList() {
  const projects = useLive((a) => a.listProjects(), 'projects');
  const [type, setType] = useState<PropertyType | ''>('');
  const [bhk, setBhk] = useState('');
  const [budget, setBudget] = useState('');
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const maxBudget = budget === '' ? null : Number(budget) * 100_000;

  const shown = (projects.data ?? []).filter((p) => {
    const units = p.units.filter(
      (u) =>
        u.status === 'available' &&
        (bhk === '' || u.bhk === Number(bhk)) &&
        (maxBudget === null || u.price <= maxBudget),
    );
    return (
      (type === '' || p.type === type) &&
      (q === '' || p.name.toLowerCase().includes(q) || p.location.toLowerCase().includes(q)) &&
      ((bhk === '' && maxBudget === null) || units.length > 0)
    );
  });

  return (
    <>
      <PageHeader
        title="Properties"
        subtitle={
          projects.data
            ? `${countOf(unitCount(projects.data, 'available'), 'unit')} available across ${countOf(projects.data.length, 'project')}. Share one into a chat as a card.`
            : 'Skyline Realty projects and their units.'
        }
      />
      {projects.data && (
        <StatStrip
          label="Units by status"
          stats={[
            {
              key: 'projects',
              label: 'Projects',
              value: projects.data.length,
              hint: `${projects.data.reduce((n, p) => n + p.units.length, 0)} units in total`,
              tone: 'neutral',
            },
            {
              key: 'available',
              label: 'Available',
              value: unitCount(projects.data, 'available'),
              hint: 'Ready to share',
              tone: 'green',
            },
            {
              key: 'reserved',
              label: 'Reserved',
              value: unitCount(projects.data, 'reserved'),
              hint: 'On hold for a buyer',
              tone: 'yellow',
            },
            {
              key: 'sold',
              label: 'Sold',
              value: unitCount(projects.data, 'sold'),
              hint: 'No longer offered',
              tone: 'grey',
            },
          ]}
        />
      )}
      <div className="filters">
        <input
          type="search"
          placeholder="Search project or area"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search properties"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as PropertyType | '')}
          aria-label="Type"
        >
          <option value="">All types</option>
          {PropertyType.options.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={bhk} onChange={(e) => setBhk(e.target.value)} aria-label="BHK">
          <option value="">Any BHK</option>
          {[2, 3, 4].map((b) => (
            <option key={b} value={b}>
              {b} BHK
            </option>
          ))}
        </select>
        <label className="inline-field">
          <span>Max ₹ L</span>
          <input
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="narrow"
          />
        </label>
      </div>
      {projects.loading && <Skeleton rows={4} />}
      {projects.error !== undefined && <ErrorNote error={projects.error} />}
      {!projects.loading && shown.length === 0 && (
        <Empty title="No projects match" hint="Raise the budget or clear a filter." />
      )}
      <div className="card-grid">
        {shown.map((p) => {
          const price = fromPrice(p);
          const available = p.units.filter((u) => u.status === 'available').length;
          return (
            <Link key={p.id} to={`/properties/${p.id}`} className="project-card">
              <img
                src={p.photos[0] ? photoSrc(p, p.photos[0], 0) : placeholderImage(p.name, p.id)}
                alt=""
              />
              <div className="project-card-body">
                <div className="project-card-top">
                  <strong>{p.name}</strong>
                  <Chip tone="info">{p.type}</Chip>
                </div>
                <span className="muted small">{p.location}</span>
                <span className="price">
                  {price !== null ? `From ${formatPrice(price)}` : 'Sold out'}
                </span>
                <span className="muted small">
                  {available} of {p.units.length} units available
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function ProjectDetail({ id }: { id: string }) {
  const { api } = useDemo();
  const user = useUser();
  const toast = useToast();
  const project = useLive((a) => a.getProject(id), `project:${id}`);
  const [photo, setPhoto] = useState(0);
  const [sharing, setSharing] = useState<string | null | undefined>(undefined);
  const [uploadError, setUploadError] = useState<string>();
  const canManage = demoCan(user.role, 'properties.manage');

  if (project.error !== undefined) return <ErrorNote error={project.error} />;
  if (!project.data) return <Skeleton rows={6} />;
  const p = project.data;
  const current = p.photos[photo] ?? p.photos[0];

  async function onFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = uploadProblem({ name: file.name, mime: file.type, size: file.size });
    setUploadError(problem ?? undefined);
    if (problem) return;
    try {
      await api.uploadMedia(id, {
        name: file.name,
        mime: file.type,
        size: file.size,
        url: URL.createObjectURL(file),
      });
      toast({ tone: 'ok', title: `${file.name} uploaded (this session only)` });
    } catch (err) {
      setUploadError(errorText(err));
    }
  }

  return (
    <>
      <p className="crumbs">
        <Link to="/properties">Properties</Link> / {p.name}
      </p>
      <PageHeader
        title={p.name}
        subtitle={`${p.location} · ${p.type}`}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setSharing(null)}>
            Share into chat
          </button>
        }
      />
      <div className="detail-grid">
        <div className="detail-main">
          <section className="card">
            {current && (
              <img className="gallery-main" src={photoSrc(p, current, photo)} alt={current.name} />
            )}
            <div className="gallery-thumbs">
              {p.photos.map((m, n) => (
                <button
                  key={m.id}
                  type="button"
                  className={n === photo ? 'thumb active' : 'thumb'}
                  onClick={() => setPhoto(n)}
                  aria-label={`Photo ${n + 1}`}
                >
                  <img src={photoSrc(p, m, n)} alt="" />
                  {m.sessionOnly && <span className="thumb-tag">Session</span>}
                </button>
              ))}
            </div>
            <p className="muted small">Photos are generated placeholders in the demo.</p>
          </section>
          <section className="card">
            <h2>About</h2>
            <p>{p.description}</p>
            <div className="chip-row">
              {p.amenities.map((a) => (
                <Chip key={a}>{a}</Chip>
              ))}
            </div>
          </section>
          <section className="card">
            <h2>Units</h2>
            <div className="table-wrap flat">
              <table>
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Size</th>
                    <th>Floor</th>
                    <th>Price</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {p.units.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.label}</strong>
                        {u.bhk !== null && <span className="muted small"> · {u.bhk} BHK</span>}
                      </td>
                      <td>{u.areaSqft.toLocaleString('en-IN')} sq ft</td>
                      <td>{u.floor ?? '—'}</td>
                      <td>{formatPrice(u.price)}</td>
                      <td>
                        <Chip tone={UNIT_TONE[u.status] ?? 'neutral'}>{u.status}</Chip>
                      </td>
                      <td>
                        {u.status !== 'sold' && (
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => setSharing(u.id)}
                          >
                            Share
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <aside className="detail-side">
          <section className="card">
            <h2>Brochures</h2>
            <ul className="plain-list">
              {p.brochures.map((b) => (
                <li key={b.id}>
                  {b.url ? (
                    <a href={b.url} target="_blank" rel="noreferrer">
                      {b.name}
                    </a>
                  ) : (
                    <span>{b.name}</span>
                  )}
                  <span className="muted small">
                    {' '}
                    · {(b.sizeBytes / 1024 / 1024).toFixed(1)} MB
                  </span>{' '}
                  {b.sessionOnly ? <Tag>Session only</Tag> : <Tag>Demo file</Tag>}
                </li>
              ))}
            </ul>
          </section>
          {canManage && (
            <section className="card">
              <h2>Upload</h2>
              <p className="muted small">
                JPG or PNG up to 5 MB, PDF up to 10 MB. Kept for this browser session only.
              </p>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                onChange={(e) => void onFile(e)}
                aria-label="Upload a photo or brochure"
              />
              {uploadError && <p className="error-note">{uploadError}</p>}
            </section>
          )}
        </aside>
      </div>
      {sharing !== undefined && (
        <ShareModal projectId={id} unitId={sharing} onClose={() => setSharing(undefined)} />
      )}
    </>
  );
}

// Pick what to share and where. Either side can be fixed by the caller.
export function ShareModal({
  projectId,
  unitId = null,
  conversationId,
  onClose,
}: {
  projectId?: string;
  unitId?: string | null;
  conversationId?: string;
  onClose: () => void;
}) {
  const { api } = useDemo();
  const toast = useToast();
  const projects = useLive((a) => a.listProjects(), 'projects');
  const chats = useLive((a) => a.listConversations(), 'conversations');
  const [project, setProject] = useState(projectId ?? '');
  const [unit, setUnit] = useState<string>(unitId ?? '');
  const [chat, setChat] = useState(conversationId ?? '');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const chosenProject = (projects.data ?? []).find(
    (p) => p.id === (project || projects.data?.[0]?.id),
  );
  const openChats = (chats.data ?? []).filter((c) => c.status !== 'closed');
  const chosenChat = chat || openChats[0]?.id || '';
  const card = chosenProject ? propertyCard(chosenProject, unit || null) : undefined;

  async function send(): Promise<void> {
    if (!chosenProject || !chosenChat) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.shareProperty(chosenChat, chosenProject.id, unit || null);
      toast({ tone: 'ok', title: 'Property shared', to: `/inbox/${chosenChat}` });
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Share into chat"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !card || !chosenChat}
            onClick={() => void send()}
          >
            Send to customer
          </button>
        </>
      }
    >
      <div className="form">
        {!projectId && (
          <label>
            Project
            <select
              value={chosenProject?.id ?? ''}
              onChange={(e) => {
                setProject(e.target.value);
                setUnit('');
              }}
            >
              {(projects.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Unit
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="">Whole project (from price)</option>
            {(chosenProject?.units ?? [])
              .filter((u) => u.status !== 'sold')
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label} · {u.bhk ? `${u.bhk} BHK · ` : ''}
                  {formatPrice(u.price)}
                </option>
              ))}
          </select>
        </label>
        {!conversationId && (
          <label>
            Chat
            <select value={chosenChat} onChange={(e) => setChat(e.target.value)}>
              {openChats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.contact.name ?? formatPhone(c.contact.phone)}
                </option>
              ))}
            </select>
          </label>
        )}
        {card && (
          <div>
            <span className="muted small">Preview</span>
            <div className="property-card">
              <div className="property-thumb" aria-hidden="true">
                {card.title.slice(0, 1)}
              </div>
              <div>
                <strong>{card.title}</strong>
                <div className="muted small">{card.subtitle}</div>
                <div className="price">
                  {card.unitId ? '' : 'From '}
                  {formatPrice(card.price)}
                </div>
              </div>
            </div>
          </div>
        )}
        {error && <p className="error-note">{error}</p>}
      </div>
    </Modal>
  );
}
