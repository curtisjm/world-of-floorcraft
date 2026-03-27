import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { levelEnum } from "../../shared/db/enums";
import { users } from "../../shared/schema";

export { levelEnum };

export const dances = pgTable("dances", {
  id: serial("id").primaryKey(),
  name: text("name").unique().notNull(),
  displayName: text("display_name").notNull(),
  timeSignature: text("time_signature"),
  tempoDescription: text("tempo_description"),
});

export const figures = pgTable(
  "figures",
  {
    id: serial("id").primaryKey(),
    danceId: integer("dance_id")
      .references(() => dances.id)
      .notNull(),
    figureNumber: integer("figure_number"),
    name: text("name").notNull(),
    variantName: text("variant_name"),
    level: levelEnum("level").notNull(),
    leaderSteps: jsonb("leader_steps"),
    followerSteps: jsonb("follower_steps"),
    leaderFootwork: text("leader_footwork"),
    followerFootwork: text("follower_footwork"),
    leaderCbm: text("leader_cbm"),
    followerCbm: text("follower_cbm"),
    leaderSway: text("leader_sway"),
    followerSway: text("follower_sway"),
    timing: text("timing"),
    beatValue: text("beat_value"),
    notes: jsonb("notes").$type<string[]>(),
  },
  (table) => ({
    danceIdx: index("figures_dance_idx").on(table.danceId),
    danceLevelIdx: index("figures_dance_level_idx").on(table.danceId, table.level),
  })
);

export const figureEdges = pgTable(
  "figure_edges",
  {
    id: serial("id").primaryKey(),
    sourceFigureId: integer("source_figure_id")
      .references(() => figures.id)
      .notNull(),
    targetFigureId: integer("target_figure_id")
      .references(() => figures.id)
      .notNull(),
    level: levelEnum("level").notNull(),
    conditions: text("conditions"),
  },
  (table) => ({
    sourceIdx: index("figure_edges_source_idx").on(table.sourceFigureId),
    targetIdx: index("figure_edges_target_idx").on(table.targetFigureId),
    levelIdx: index("figure_edges_level_idx").on(table.level),
    uniqueTransition: uniqueIndex("figure_edges_unique_transition_idx").on(
      table.sourceFigureId,
      table.targetFigureId,
      table.level,
      table.conditions
    ),
  })
);

export const figureNotes = pgTable(
  "figure_notes",
  {
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
  },
  (table) => ({
    userIdx: index("figure_notes_user_idx").on(table.userId),
    figureIdx: index("figure_notes_figure_idx").on(table.figureId),
  })
);
