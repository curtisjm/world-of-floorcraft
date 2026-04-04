import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  date,
  numeric,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "@shared/schema";
import { organizations } from "@orgs/schema";
import {
  competitionStatusEnum,
  competitionLevelEnum,
  scheduleBlockTypeEnum,
  competitionStaffRoleEnum,
  danceStyleEnum,
  eventTypeEnum,
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
