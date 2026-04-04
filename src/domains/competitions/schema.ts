import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "@shared/schema";
import { organizations } from "@orgs/schema";
import {
  competitionStatusEnum,
  competitionLevelEnum,
  scheduleBlockTypeEnum,
  competitionStaffRoleEnum,
  danceStyleEnum,
  eventTypeEnum,
  pricingModelEnum,
  danceRoleEnum,
  paymentMethodEnum,
  addDropTypeEnum,
  addDropStatusEnum,
  roundStatusEnum,
  roundTypeEnum,
} from "@shared/db/enums";

// ── Competitions ────────────────────────────────────────────────────

export const competitions = pgTable("competitions", {
  id: serial("id").primaryKey(),
  orgId: integer("org_id")
    .references(() => organizations.id)
    .notNull(),
  createdBy: text("created_by")
    .references(() => users.id)
    .notNull(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  status: competitionStatusEnum("status").notNull().default("draft"),
  description: text("description"),
  rules: text("rules"),
  venueName: text("venue_name"),
  streetAddress: text("street_address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  country: text("country"),
  venueNotes: text("venue_notes"),
  maxFinalSize: integer("max_final_size").default(8),
  maxHeatSize: integer("max_heat_size"),
  baseFee: numeric("base_fee", { precision: 10, scale: 2 }),
  numberStart: integer("number_start").default(1),
  numberExclusions: integer("number_exclusions").array(),
  pricingModel: pricingModelEnum("pricing_model").notNull().default("flat_fee"),
  requirePaymentAtRegistration: boolean("require_payment_at_registration").notNull().default(false),
  stripeAccountId: text("stripe_account_id"),
  stripeOnboardingComplete: boolean("stripe_onboarding_complete").notNull().default(false),
  minutesPerCouplePerDance: numeric("minutes_per_couple_per_dance", { precision: 4, scale: 1 }).default("1.5"),
  transitionMinutes: numeric("transition_minutes", { precision: 4, scale: 1 }).default("2.0"),
  compCode: text("comp_code").unique(),
  masterPasswordHash: text("master_password_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Competition Days ────────────────────────────────────────────────

export const competitionDays = pgTable(
  "competition_days",
  {
    id: serial("id").primaryKey(),
    competitionId: integer("competition_id")
      .references(() => competitions.id, { onDelete: "cascade" })
      .notNull(),
    date: date("date", { mode: "string" }).notNull(),
    label: text("label"),
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("competition_days_comp_pos_idx").on(
      table.competitionId,
      table.position,
    ),
  ],
);

// ── Schedule Blocks ─────────────────────────────────────────────────

export const scheduleBlocks = pgTable(
  "schedule_blocks",
  {
    id: serial("id").primaryKey(),
    dayId: integer("day_id")
      .references(() => competitionDays.id, { onDelete: "cascade" })
      .notNull(),
    type: scheduleBlockTypeEnum("type").notNull(),
    label: text("label").notNull(),
    position: integer("position").notNull(),
    estimatedStartTime: timestamp("estimated_start_time"),
    estimatedEndTime: timestamp("estimated_end_time"),
  },
  (table) => [
    uniqueIndex("schedule_blocks_day_pos_idx").on(table.dayId, table.position),
  ],
);

// ── Competition Events ──────────────────────────────────────────────

export const competitionEvents = pgTable(
  "competition_events",
  {
    id: serial("id").primaryKey(),
    competitionId: integer("competition_id")
      .references(() => competitions.id, { onDelete: "cascade" })
      .notNull(),
    sessionId: integer("session_id").references(() => scheduleBlocks.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    style: danceStyleEnum("style").notNull(),
    level: competitionLevelEnum("level").notNull(),
    eventType: eventTypeEnum("event_type").notNull(),
    position: integer("position"),
    maxFinalSize: integer("max_final_size"),
    maxHeatSize: integer("max_heat_size"),
    entryPrice: numeric("entry_price", { precision: 10, scale: 2 }),
  },
  (table) => [
    index("competition_events_comp_session_idx").on(
      table.competitionId,
      table.sessionId,
    ),
  ],
);

// ── Event Dances ────────────────────────────────────────────────────

export const eventDances = pgTable(
  "event_dances",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .references(() => competitionEvents.id, { onDelete: "cascade" })
      .notNull(),
    danceName: text("dance_name").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("event_dances_event_pos_idx").on(table.eventId, table.position),
  ],
);

// ── Judges (Global Directory) ───────────────────────────────────────

export const judges = pgTable(
  "judges",
  {
    id: serial("id").primaryKey(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    initials: text("initials"),
    affiliation: text("affiliation"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("judges_name_idx").on(table.lastName, table.firstName)],
);

// ── Competition Staff ───────────────────────────────────────────────

export const competitionStaff = pgTable(
  "competition_staff",
  {
    id: serial("id").primaryKey(),
    competitionId: integer("competition_id")
      .references(() => competitions.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    role: competitionStaffRoleEnum("role").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("competition_staff_comp_user_role_idx").on(
      table.competitionId,
      table.userId,
      table.role,
    ),
  ],
);

// ── Competition Judges ──────────────────────────────────────────────

export const competitionJudges = pgTable(
  "competition_judges",
  {
    id: serial("id").primaryKey(),
    competitionId: integer("competition_id")
      .references(() => competitions.id, { onDelete: "cascade" })
      .notNull(),
    judgeId: integer("judge_id")
      .references(() => judges.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("competition_judges_comp_judge_idx").on(
      table.competitionId,
      table.judgeId,
    ),
  ],
);

// ── Pricing Tiers ───────────────────────────────────────────────────

export const pricingTiers = pgTable("pricing_tiers", {
  id: serial("id").primaryKey(),
  competitionId: integer("competition_id")
    .references(() => competitions.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  position: integer("position"),
});

// ── Competition Registrations ───────────────────────────────────────

export const competitionRegistrations = pgTable(
  "competition_registrations",
  {
    id: serial("id").primaryKey(),
    competitionId: integer("competition_id")
      .references(() => competitions.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    competitorNumber: integer("competitor_number"),
    pricingTierId: integer("pricing_tier_id").references(() => pricingTiers.id),
    amountOwed: numeric("amount_owed", { precision: 10, scale: 2 }).notNull().default("0"),
    paidConfirmed: boolean("paid_confirmed").notNull().default(false),
    checkedIn: boolean("checked_in").notNull().default(false),
    orgId: integer("org_id").references(() => organizations.id),
    registeredAt: timestamp("registered_at").defaultNow().notNull(),
    registeredBy: text("registered_by")
      .references(() => users.id)
      .notNull(),
    cancelled: boolean("cancelled").notNull().default(false),
  },
  (table) => [
    uniqueIndex("comp_reg_comp_user_idx").on(table.competitionId, table.userId),
    uniqueIndex("comp_reg_comp_number_idx")
      .on(table.competitionId, table.competitorNumber)
      .where(sql`competitor_number IS NOT NULL`),
    index("comp_reg_comp_org_idx").on(table.competitionId, table.orgId),
  ],
);

// ── Entries ─────────────────────────────────────────────────────────

export const entries = pgTable(
  "entries",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .references(() => competitionEvents.id, { onDelete: "cascade" })
      .notNull(),
    leaderRegistrationId: integer("leader_registration_id")
      .references(() => competitionRegistrations.id)
      .notNull(),
    followerRegistrationId: integer("follower_registration_id")
      .references(() => competitionRegistrations.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by")
      .references(() => users.id)
      .notNull(),
    scratched: boolean("scratched").notNull().default(false),
  },
  (table) => [
    uniqueIndex("entries_event_couple_idx").on(
      table.eventId,
      table.leaderRegistrationId,
      table.followerRegistrationId,
    ),
    index("entries_event_idx").on(table.eventId),
    index("entries_leader_idx").on(table.leaderRegistrationId),
    index("entries_follower_idx").on(table.followerRegistrationId),
  ],
);

// ── Payments ────────────────────────────────────────────────────────

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    registrationId: integer("registration_id")
      .references(() => competitionRegistrations.id, { onDelete: "cascade" })
      .notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    method: paymentMethodEnum("method").notNull(),
    note: text("note"),
    entryId: integer("entry_id").references(() => entries.id),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    processedBy: text("processed_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("payments_registration_idx").on(table.registrationId)],
);

// ── TBA Listings ────────────────────────────────────────────────────

export const tbaListings = pgTable(
  "tba_listings",
  {
    id: serial("id").primaryKey(),
    competitionId: integer("competition_id")
      .references(() => competitions.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    style: danceStyleEnum("style").notNull(),
    level: competitionLevelEnum("level").notNull(),
    role: danceRoleEnum("role").notNull(),
    notes: text("notes"),
    fulfilled: boolean("fulfilled").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("tba_listings_comp_fulfilled_idx").on(
      table.competitionId,
      table.fulfilled,
    ),
  ],
);

// ── Team Match Submissions ──────────────────────────────────────────

export const teamMatchSubmissions = pgTable("team_match_submissions", {
  id: serial("id").primaryKey(),
  competitionId: integer("competition_id")
    .references(() => competitions.id, { onDelete: "cascade" })
    .notNull(),
  userId: text("user_id")
    .references(() => users.id)
    .notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Add/Drop Requests ───────────────────────────────��──────────────

export const addDropRequests = pgTable(
  "add_drop_requests",
  {
    id: serial("id").primaryKey(),
    competitionId: integer("competition_id")
      .references(() => competitions.id, { onDelete: "cascade" })
      .notNull(),
    submittedBy: text("submitted_by")
      .references(() => users.id)
      .notNull(),
    type: addDropTypeEnum("type").notNull(),
    eventId: integer("event_id")
      .references(() => competitionEvents.id)
      .notNull(),
    leaderRegistrationId: integer("leader_registration_id")
      .references(() => competitionRegistrations.id)
      .notNull(),
    followerRegistrationId: integer("follower_registration_id")
      .references(() => competitionRegistrations.id)
      .notNull(),
    reason: text("reason"),
    status: addDropStatusEnum("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    affectsRounds: boolean("affects_rounds"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("add_drop_requests_comp_status_idx").on(
      table.competitionId,
      table.status,
    ),
  ],
);

// ── Rounds ─────────���───────────────────────────────────────────────

export const rounds = pgTable(
  "rounds",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .references(() => competitionEvents.id, { onDelete: "cascade" })
      .notNull(),
    roundType: roundTypeEnum("round_type").notNull(),
    position: integer("position").notNull(),
    callbacksRequested: integer("callbacks_requested"),
    status: roundStatusEnum("status").notNull().default("pending"),
  },
  (table) => [
    uniqueIndex("rounds_event_pos_idx").on(table.eventId, table.position),
  ],
);

// ── Heats ─────────────��────────────────────────────────────────────

export const heats = pgTable(
  "heats",
  {
    id: serial("id").primaryKey(),
    roundId: integer("round_id")
      .references(() => rounds.id, { onDelete: "cascade" })
      .notNull(),
    heatNumber: integer("heat_number").notNull(),
    status: roundStatusEnum("status").notNull().default("pending"),
  },
  (table) => [
    uniqueIndex("heats_round_number_idx").on(table.roundId, table.heatNumber),
  ],
);

// ── Heat Assignments ───────────��───────────────────────────────────

export const heatAssignments = pgTable(
  "heat_assignments",
  {
    id: serial("id").primaryKey(),
    heatId: integer("heat_id")
      .references(() => heats.id, { onDelete: "cascade" })
      .notNull(),
    entryId: integer("entry_id")
      .references(() => entries.id)
      .notNull(),
  },
  (table) => [
    uniqueIndex("heat_assignments_heat_entry_idx").on(
      table.heatId,
      table.entryId,
    ),
  ],
);

// ── Event Time Overrides ───────────��───────────────────────────────

export const eventTimeOverrides = pgTable("event_time_overrides", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id")
    .references(() => competitionEvents.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  estimatedMinutes: numeric("estimated_minutes", { precision: 5, scale: 1 }).notNull(),
});
