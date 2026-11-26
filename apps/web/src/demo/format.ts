// Display helpers for demo mode: rupee amounts, phone numbers and times.

// ₹ in lakh and crore (DEMO Decision 9): 8200000 → "₹82 L", 13500000 → "₹1.35 Cr".
export function formatPrice(rupees: number): string {
  if (rupees >= 10_000_000) return `₹${trim(rupees / 10_000_000)} Cr`;
  if (rupees >= 100_000) return `₹${trim(rupees / 100_000)} L`;
  return `₹${rupees.toLocaleString('en-IN')}`;
}

function trim(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '');
}

// "+12025550101" → "+1 202 555 0101". Other formats are shown as stored.
export function formatPhone(phone: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return m ? `+1 ${m[1]} ${m[2]} ${m[3]}` : phone;
}

// "just now", "5 min ago", "3 h ago", "yesterday", or a date.
export function formatAgo(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  if (h < 48) return 'yesterday';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// "1 chat", "3 chats": a count with its noun.
export function countOf(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
