import { pgTable, serial, text, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "@shared/schema";
import {
  membershipModelEnum,
  orgRoleEnum,
  inviteStatusEnum,
  joinRequestStatusEnum,
} from "@shared/db/enums";

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  avatarUrl: text("avatar_url"),
  membershipModel: membershipModelEnum("membership_model").notNull().default("open"),
  ownerId: text("owner_id")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    role: orgRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    orgUserUnique: uniqueIndex("memberships_org_user_idx").on(table.orgId, table.userId),
  })
);

export const orgInvites = pgTable(
  "org_invites",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    invitedUserId: text("invited_user_id").references(() => users.id),
    invitedBy: text("invited_by")
      .references(() => users.id)
      .notNull(),
    token: text("token").unique(),
    status: inviteStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => ({
    orgIdx: index("org_invites_org_idx").on(table.orgId),
  })
);

export const joinRequests = pgTable(
  "join_requests",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    status: joinRequestStatusEnum("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at"),
  },
  (table) => ({
    orgIdx: index("join_requests_org_idx").on(table.orgId),
    orgUserIdx: uniqueIndex("join_requests_org_user_idx").on(table.orgId, table.userId),
  })
);
