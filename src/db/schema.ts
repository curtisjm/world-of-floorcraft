import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const levelEnum = pgEnum("level", [
  "student_teacher",
  "associate",
  "licentiate",
  "fellow",
]);

export const wallSegmentEnum = pgEnum("wall_segment", [
  "long1",
  "short1",
  "long2",
  "short2",
]);

export const dances = pgTable("dances", {
  id: serial("id").primaryKey(),
  name: text("name").unique().notNull(),
  displayName: text("display_name").notNull(),
  timeSignature: text("time_signature"),
  tempoDescription: text("tempo_description"),
});

export const figures = pgTable("figures", {
  id: serial("id").primaryKey(),
  danceId: integer("dance_id")
    .references(() => dances.id)
    .notNull(),
  figureNumber: integer("figure_number"),
  name: text("name").notNull(),
  variantName: text("variant_name"),
  level: levelEnum("level").notNull(),
  manSteps: jsonb("man_steps"),
  ladySteps: jsonb("lady_steps"),
  manFootwork: text("man_footwork"),
  ladyFootwork: text("lady_footwork"),
  manCbm: text("man_cbm"),
  ladyCbm: text("lady_cbm"),
  manSway: text("man_sway"),
  ladySway: text("lady_sway"),
  timing: text("timing"),
  beatValue: text("beat_value"),
  notes: jsonb("notes").$type<string[]>(),
});

export const figureEdges = pgTable("figure_edges", {
  id: serial("id").primaryKey(),
  sourceFigureId: integer("source_figure_id")
    .references(() => figures.id)
    .notNull(),
  targetFigureId: integer("target_figure_id")
    .references(() => figures.id)
    .notNull(),
  level: levelEnum("level").notNull(),
  conditions: text("conditions"),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const routines = pgTable("routines", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .references(() => users.id)
    .notNull(),
  danceId: integer("dance_id")
    .references(() => dances.id)
    .notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isPublished: boolean("is_published").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const routineEntries = pgTable("routine_entries", {
  id: serial("id").primaryKey(),
  routineId: integer("routine_id")
    .references(() => routines.id)
    .notNull(),
  figureId: integer("figure_id")
    .references(() => figures.id)
    .notNull(),
  position: integer("position").notNull(),
  wallSegment: wallSegmentEnum("wall_segment"),
  notes: text("notes"),
});

export const figureNotes = pgTable("figure_notes", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .references(() => users.id)
    .notNull(),
  figureId: integer("figure_id")
    .references(() => figures.id)
    .notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
