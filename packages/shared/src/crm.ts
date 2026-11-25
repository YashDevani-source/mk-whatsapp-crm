// DEMO draft contracts for the modules that have no api yet: inbox extras (INB), leads (LEAD),
// properties (PROP), follow-ups (FUP), campaigns (CAMP), users (USR), audit (AUD). The demo mode
// in apps/web uses them for its dummy data (docs/specs/004-demo.md); the real specs start from
// them and may change them.
import { z } from 'zod';
import { Role } from './auth.ts';
import { ContactView, ConversationSummary, MessageSender, MessageView } from './messages.ts';

const At = z.iso.datetime();

export const UserView = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  email: z.email(),
  role: Role,
  active: z.boolean(),
  createdAt: At,
});
export type UserView = z.infer<typeof UserView>;

// DEMO Decision 7: placeholders until the LEAD spec names the five middle stages.
export const LeadStage = z.enum([
  'new',
  'contacted',
  'qualified',
  'site_visit',
  'negotiation',
  'converted',
  'lost',
]);
export type LeadStage = z.infer<typeof LeadStage>;

export const LEAD_STAGE_LABELS: Readonly<Record<LeadStage, string>> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  site_visit: 'Site visit',
  negotiation: 'Negotiation',
  converted: 'Converted',
  lost: 'Lost',
};

// A lead in one of these stages is closed; a customer has at most one open lead.
export const CLOSED_LEAD_STAGES: readonly LeadStage[] = ['converted', 'lost'];

export const PropertyType = z.enum(['apartment', 'villa', 'plot']);
export type PropertyType = z.infer<typeof PropertyType>;

// Amounts are whole rupees (DEMO Decision 9).
export const LeadNeeds = z.object({
  budgetMin: z.number().int().nonnegative().nullable(),
  budgetMax: z.number().int().nonnegative().nullable(),
  location: z.string().nullable(),
  propertyType: PropertyType.nullable(),
  bhk: z.number().int().min(1).max(6).nullable(),
});
export type LeadNeeds = z.infer<typeof LeadNeeds>;

export const LeadSource = z.enum(['whatsapp', 'campaign', 'manual']);
export type LeadSource = z.infer<typeof LeadSource>;

export const LeadView = z.object({
  v: z.literal(1),
  id: z.uuid(),
  contact: ContactView,
  stage: LeadStage,
  owner: MessageSender.nullable(),
  needs: LeadNeeds,
  source: LeadSource,
  conversationId: z.uuid().nullable(),
  createdAt: At,
  updatedAt: At,
  closedAt: At.nullable(),
});
export type LeadView = z.infer<typeof LeadView>;

export const LeadHistoryField = z.enum(['created', 'stage', 'owner', 'needs']);
export type LeadHistoryField = z.infer<typeof LeadHistoryField>;

export const LeadHistoryEntry = z.object({
  id: z.uuid(),
  leadId: z.uuid(),
  actor: MessageSender.nullable(),
  field: LeadHistoryField,
  from: z.string().nullable(),
  to: z.string().nullable(),
  at: At,
});
export type LeadHistoryEntry = z.infer<typeof LeadHistoryEntry>;

export const ConversationStatus = z.enum(['open', 'pending', 'closed']);
export type ConversationStatus = z.infer<typeof ConversationStatus>;

// One row of the inbox list: the MSG summary plus what INB adds.
export const InboxConversation = ConversationSummary.extend({
  status: ConversationStatus,
  assignee: MessageSender.nullable(),
  unreadCount: z.number().int().nonnegative(),
  leadId: z.uuid().nullable(),
  leadStage: LeadStage.nullable(),
});
export type InboxConversation = z.infer<typeof InboxConversation>;

// An internal note: stored with the conversation, never sent to the customer.
export const NoteView = z.object({
  v: z.literal(1),
  id: z.uuid(),
  conversationId: z.uuid(),
  body: z.string().min(1),
  author: MessageSender,
  at: At,
});
export type NoteView = z.infer<typeof NoteView>;

// A property shared into a chat travels as a normal outbound message with this card attached.
export const PropertyCard = z.object({
  projectId: z.uuid(),
  unitId: z.uuid().nullable(),
  title: z.string(),
  subtitle: z.string(),
  price: z.number().int().nonnegative(),
});
export type PropertyCard = z.infer<typeof PropertyCard>;

export const InboxItem = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('message'), message: MessageView, property: PropertyCard.nullable() }),
  z.object({ kind: z.literal('note'), note: NoteView }),
]);
export type InboxItem = z.infer<typeof InboxItem>;

export const ReplyLock = z.object({
  conversationId: z.uuid(),
  holder: MessageSender,
  expiresAt: At,
});
export type ReplyLock = z.infer<typeof ReplyLock>;

// `url` null means a placeholder generated in the browser; `sessionOnly` files are not saved.
export const MediaFile = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(['image', 'pdf']),
  sizeBytes: z.number().int().nonnegative(),
  url: z.string().nullable(),
  sessionOnly: z.boolean(),
});
export type MediaFile = z.infer<typeof MediaFile>;

export const UnitView = z.object({
  id: z.uuid(),
  label: z.string(),
  bhk: z.number().int().min(1).max(6).nullable(),
  areaSqft: z.number().int().positive(),
  price: z.number().int().nonnegative(),
  floor: z.number().int().nullable(),
  status: z.enum(['available', 'reserved', 'sold']),
});
export type UnitView = z.infer<typeof UnitView>;

export const ProjectView = z.object({
  v: z.literal(1),
  id: z.uuid(),
  name: z.string(),
  location: z.string(),
  type: PropertyType,
  description: z.string(),
  amenities: z.array(z.string()),
  photos: z.array(MediaFile),
  brochures: z.array(MediaFile),
  units: z.array(UnitView),
});
export type ProjectView = z.infer<typeof ProjectView>;

export const FollowUpView = z.object({
  v: z.literal(1),
  id: z.uuid(),
  leadId: z.uuid(),
  conversationId: z.uuid().nullable(),
  contact: ContactView,
  owner: MessageSender,
  dueAt: At,
  note: z.string(),
  // The test auto-reply "Run now (test)" sends once; `sentAt` records that it was sent.
  autoReply: z.string().nullable(),
  sentAt: At.nullable(),
  doneAt: At.nullable(),
});
export type FollowUpView = z.infer<typeof FollowUpView>;

export const CampaignStatus = z.enum(['draft', 'running', 'paused', 'completed']);
export type CampaignStatus = z.infer<typeof CampaignStatus>;

export const RecipientStatus = z.enum(['pending', 'sent', 'skipped', 'failed']);
export type RecipientStatus = z.infer<typeof RecipientStatus>;

export const RecipientReason = z.enum([
  'invalid_phone',
  'duplicate',
  'not_test_number',
  'opted_out',
  'wa_not_connected',
]);
export type RecipientReason = z.infer<typeof RecipientReason>;

export const CampaignRecipient = z.object({
  phone: z.string(),
  name: z.string().nullable(),
  status: RecipientStatus,
  reason: RecipientReason.nullable(),
  at: At.nullable(),
});
export type CampaignRecipient = z.infer<typeof CampaignRecipient>;

export const CampaignView = z.object({
  v: z.literal(1),
  id: z.uuid(),
  name: z.string().min(1),
  message: z.string().min(1),
  status: CampaignStatus,
  testOnly: z.boolean(),
  createdBy: MessageSender,
  createdAt: At,
  startedAt: At.nullable(),
  completedAt: At.nullable(),
  recipients: z.array(CampaignRecipient),
});
export type CampaignView = z.infer<typeof CampaignView>;

export const OptOut = z.object({
  phone: z.string(),
  reason: z.enum(['customer_stop', 'manual']),
  addedBy: MessageSender.nullable(),
  at: At,
});
export type OptOut = z.infer<typeof OptOut>;

export const AuditAction = z.enum([
  'auth.login',
  'auth.logout',
  'wa.connected',
  'wa.disconnected',
  'wa.logout',
  'conversation.assigned',
  'conversation.status',
  'lead.created',
  'lead.stage',
  'lead.owner',
  'lead.needs',
  'property.shared',
  'followup.sent',
  'campaign.created',
  'campaign.started',
  'campaign.paused',
  'campaign.resumed',
  'campaign.completed',
  'optout.added',
  'optout.removed',
  'user.created',
  'user.role',
  'user.deactivated',
]);
export type AuditAction = z.infer<typeof AuditAction>;

// Append-only: there is no route or function that edits or deletes an entry.
export const AuditEntry = z.object({
  id: z.uuid(),
  actor: MessageSender.nullable(),
  action: AuditAction,
  target: z.string().nullable(),
  detail: z.string().nullable(),
  at: At,
});
export type AuditEntry = z.infer<typeof AuditEntry>;

// Body of "create follow-up" (DEMO-25). Editing sends the same fields except `leadId`.
export const FollowUpInput = z.object({
  leadId: z.uuid(),
  dueAt: At,
  note: z.string().trim().min(1).max(500),
  autoReply: z.string().trim().min(1).max(4096).nullable(),
});
export type FollowUpInput = z.infer<typeof FollowUpInput>;

// Body of "start campaign" (DEMO-26). The rows are the parsed CSV; the demo api checks every row
// again before saving.
export const CampaignInput = z.object({
  name: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(1000),
  testOnly: z.boolean(),
  rows: z
    .array(
      z.object({
        phone: z.string(),
        name: z.string().nullable(),
        fields: z.record(z.string(), z.string()),
      }),
    )
    .min(1)
    .max(1000),
});
export type CampaignInput = z.infer<typeof CampaignInput>;

// Body of "add user" (DEMO-29).
export const NewUserInput = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: Role,
});
export type NewUserInput = z.infer<typeof NewUserInput>;
