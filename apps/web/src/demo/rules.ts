// Pure rules for leads, properties and follow-ups (DEMO-23 to DEMO-25), used by the demo api and
// the screens alike.
import type { LeadNeeds, PropertyCard, ProjectView } from '@crm/shared';
import { formatPrice } from './format.ts';

const MB = 1024 * 1024;
export const UPLOAD_LIMITS = { image: 5 * MB, pdf: 10 * MB } as const;

export interface UploadFile {
  name: string;
  mime: string;
  size: number;
}

export function uploadKind(file: UploadFile): 'image' | 'pdf' | null {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (
    file.mime === 'image/jpeg' ||
    file.mime === 'image/png' ||
    ['jpg', 'jpeg', 'png'].includes(ext)
  ) {
    return 'image';
  }
  if (file.mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  return null;
}

// DEMO-24: JPG or PNG up to 5 MB, PDF up to 10 MB. Null when the file is fine.
export function uploadProblem(file: UploadFile): string | null {
  const kind = uploadKind(file);
  if (kind === null) return 'Only JPG, PNG or PDF files can be uploaded.';
  if (file.size === 0) return 'The file is empty.';
  if (kind === 'image' && file.size > UPLOAD_LIMITS.image) return 'Images must be 5 MB or smaller.';
  if (kind === 'pdf' && file.size > UPLOAD_LIMITS.pdf) return 'PDFs must be 10 MB or smaller.';
  return null;
}

export type FollowUpTab = 'overdue' | 'today' | 'upcoming' | 'done';

// DEMO-25: done first; then overdue (due before now), today (later today), upcoming.
export function followUpTab(f: { dueAt: string; doneAt: string | null }, now: Date): FollowUpTab {
  if (f.doneAt !== null) return 'done';
  const due = new Date(f.dueAt);
  if (due < now) return 'overdue';
  return due.toDateString() === now.toDateString() ? 'today' : 'upcoming';
}

// One line for the lead history, e.g. "₹75 L – ₹90 L · Whitefield · apartment · 2 BHK".
export function needsSummary(n: LeadNeeds): string {
  const budget =
    n.budgetMax !== null
      ? `${n.budgetMin !== null ? `${formatPrice(n.budgetMin)} – ` : 'up to '}${formatPrice(n.budgetMax)}`
      : n.budgetMin !== null
        ? `from ${formatPrice(n.budgetMin)}`
        : null;
  const parts = [budget, n.location, n.propertyType, n.bhk !== null ? `${n.bhk} BHK` : null];
  const text = parts.filter((p): p is string => p !== null && p !== '').join(' · ');
  return text === '' ? 'Not known' : text;
}

export function budgetValid(n: LeadNeeds): boolean {
  return n.budgetMin === null || n.budgetMax === null || n.budgetMin <= n.budgetMax;
}

// The card and text a shared property sends (DEMO-24). Without a unit, the project's cheapest
// available unit gives the "from" price.
export function propertyCard(project: ProjectView, unitId: string | null): PropertyCard {
  const unit =
    project.units.find((u) => u.id === unitId) ??
    [...project.units]
      .filter((u) => u.status === 'available')
      .sort((a, b) => a.price - b.price)[0] ??
    project.units[0];
  const size = unit
    ? `${unit.bhk ? `${unit.bhk} BHK, ` : ''}${unit.areaSqft.toLocaleString('en-IN')} sq ft`
    : '';
  return {
    projectId: project.id,
    unitId: unitId && unit ? unit.id : null,
    title: unitId && unit ? `${project.name} · ${unit.label}` : project.name,
    subtitle: [size, project.location].filter(Boolean).join(' · '),
    price: unit?.price ?? 0,
  };
}

export function propertyMessage(project: ProjectView, card: PropertyCard): string {
  const brochure = project.brochures[0]?.name;
  return `${card.title}: ${card.subtitle}, ${card.unitId ? '' : 'from '}${formatPrice(card.price)}.${
    brochure ? ` Brochure: ${brochure}` : ''
  }`;
}

// A generated picture for a project photo with no file (DEMO Decision 12): a gradient and a label.
export function placeholderImage(label: string, seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  // Blues, teals, greens and warm earth tones only; no violet (DEMO-36, Decision 37).
  const HUES = [205, 190, 170, 150, 125, 40, 25, 15];
  const hue = HUES[hash % HUES.length] ?? 205;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue},55%,52%)"/><stop offset="1" stop-color="hsl(${hue + 20},60%,36%)"/>
</linearGradient></defs><rect width="640" height="400" fill="url(#g)"/>
<path d="M0 300 L160 200 L280 270 L420 150 L640 290 L640 400 L0 400Z" fill="rgba(255,255,255,0.18)"/>
<text x="32" y="360" font-family="system-ui,sans-serif" font-size="30" font-weight="600" fill="white">${label
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
