// The simulator: runs the scheduled tasks that are due (QR refresh, reconnect, ticks, a simulated
// agent's reply) and, with auto activity on, a customer enquiry about every 45 s (DEMO-22). Every
// tab runs it (DEMO Decision 19): a store write takes the due tasks out of the saved copy in one
// step, so a task runs once, and a hidden, throttled tab never holds the others up.
import type { DemoBus } from './bus.ts';
import * as engine from './engine.ts';
import { ENQUIRY_TEXTS } from './seed.ts';
import type { DemoData, DemoStore } from './store.ts';

// Only a tab someone is looking at starts an auto enquiry, so two tabs do not both send one.
let isVisible: () => boolean = () => true;
export function setVisibilityCheck(check: () => boolean): void {
  isVisible = check;
}

export const AUTO_TEXTS: readonly string[] = [
  ...ENQUIRY_TEXTS,
  'What is the price of a 3 BHK at Lakeview Towers?',
  'Do you have villas under ₹3.5 Cr?',
  'Is the Green Valley site office open on Sunday?',
  'Can someone call me back after 6 pm?',
  'Thanks for the details!',
];

function autoDue(data: DemoData, now: Date): boolean {
  if (!data.settings.autoActivity || !engine.waConnected(data)) return false;
  if (!isVisible()) return false;
  return data.sim.nextAutoAt === null || new Date(data.sim.nextAutoAt) <= now;
}

export function hasWork(data: DemoData, now: Date): boolean {
  const t = now.toISOString();
  return data.sim.tasks.some((task) => task.at <= t) || autoDue(data, now);
}

function autoEnquiry(data: DemoData, ctx: engine.EngineCtx): void {
  const text = AUTO_TEXTS[Math.floor(ctx.random() * AUTO_TEXTS.length)] ?? AUTO_TEXTS[0] ?? 'Hi';
  const active = data.conversations.filter((c) => c.status !== 'closed');
  // Mostly existing customers writing again, sometimes a new enquiry.
  const existing =
    ctx.random() < 0.6 ? active[Math.floor(ctx.random() * active.length)] : undefined;
  const phone = existing && data.contacts.find((c) => c.id === existing.contactId)?.phone;
  engine.receiveInbound(data, ctx, phone ? { phone, text } : { text });
}

// Runs everything due at `ctx.now`, oldest first. Tasks scheduled while running wait for the
// next round, even when they are due at once.
export function runDue(data: DemoData, ctx: engine.EngineCtx): void {
  const t = ctx.now.toISOString();
  const due = data.sim.tasks
    .filter((task) => task.at <= t)
    .sort((a, b) => a.at.localeCompare(b.at));
  const dueIds = new Set(due.map((task) => task.id));
  data.sim.tasks = data.sim.tasks.filter((task) => !dueIds.has(task.id));
  for (const task of due) engine.runTask(data, ctx, task);

  if (autoDue(data, ctx.now)) {
    // The first round only sets the clock, so a fresh page does not get a message at once.
    if (data.sim.nextAutoAt !== null) autoEnquiry(data, ctx);
    const jitter = (ctx.random() - 0.5) * 10_000;
    data.sim.nextAutoAt = new Date(ctx.now.getTime() + engine.TIMING.autoMs + jitter).toISOString();
  }
}

export interface SimulatorDeps {
  store: DemoStore;
  bus: DemoBus;
  now?: () => Date;
  newId?: () => string;
  random?: () => number;
  intervalMs?: number;
}

// Returns a function that stops the simulator.
export function startSimulator(deps: SimulatorDeps): () => void {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const random = deps.random ?? Math.random;
  const timer = setInterval(() => {
    const at = now();
    // Work from the newest saved copy, whichever tab wrote it.
    deps.store.sync();
    if (!hasWork(deps.store.data, at)) return;
    const ctx: engine.EngineCtx = { now: at, newId, random, events: [] };
    deps.store.write((data) => runDue(data, ctx));
    for (const envelope of ctx.events) deps.bus.emitEnvelope(envelope);
  }, deps.intervalMs ?? 500);
  return () => clearInterval(timer);
}
