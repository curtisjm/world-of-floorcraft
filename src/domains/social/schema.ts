import { index, integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "@shared/schema";

export const followStatusEnum = pgEnum("follow_status", ["active", "pending"]);

export const follows = pgTable(
  "follows",
  {
    id: serial("id").primaryKey(),
    followerId: text("follower_id").references(() => users.id).notNull(),
    followingId: text("following_id").references(() => users.id).notNull(),
    status: followStatusEnum("status").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    followerIdx: index("follows_follower_idx").on(table.followerId),
    followingIdx: index("follows_following_idx").on(table.followingId),
    uniqueFollow: uniqueIndex("follows_unique_idx").on(table.followerId, table.followingId),
  })
);

export const postTypeEnum = pgEnum("post_type", [
  "routine_share",
  "article",
]);

export const visibilityEnum = pgEnum("visibility", [
  "public",
  "followers",
  "organization",
]);

export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    authorId: text("author_id").references(() => users.id),
    orgId: integer("org_id"),  // FK added in Phase 4 when orgs table exists
    type: postTypeEnum("type").notNull(),
    visibility: visibilityEnum("visibility").notNull().default("public"),
    visibilityOrgId: integer("visibility_org_id"),  // FK added in Phase 4
    title: text("title"),
    body: text("body"),
    routineId: integer("routine_id"),  // FK to routines — cross-domain reference
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    authorIdx: index("posts_author_idx").on(table.authorId),
    typeIdx: index("posts_type_idx").on(table.type),
    publishedIdx: index("posts_published_idx").on(table.publishedAt),
    visibilityPublishedIdx: index("posts_visibility_published_idx").on(
      table.visibility,
      table.publishedAt
    ),
  })
);
