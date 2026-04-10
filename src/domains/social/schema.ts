import { index, integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "@shared/schema";
import { danceStyleEnum, rolePreferenceEnum } from "@shared/db/enums";

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

export const comments = pgTable(
  "comments",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .references(() => posts.id, { onDelete: "cascade" })
      .notNull(),
    authorId: text("author_id")
      .references(() => users.id)
      .notNull(),
    parentId: integer("parent_id"),  // self-reference for replies
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    postIdx: index("comments_post_idx").on(table.postId),
    parentIdx: index("comments_parent_idx").on(table.parentId),
  })
);

export const likes = pgTable(
  "likes",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    postId: integer("post_id").references(() => posts.id, { onDelete: "cascade" }),
    commentId: integer("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userPostUnique: uniqueIndex("likes_user_post_idx").on(table.userId, table.postId),
    userCommentUnique: uniqueIndex("likes_user_comment_idx").on(table.userId, table.commentId),
  })
);

export const saveFolders = pgTable("save_folders", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .references(() => users.id)
    .notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const savedPosts = pgTable(
  "saved_posts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    postId: integer("post_id")
      .references(() => posts.id, { onDelete: "cascade" })
      .notNull(),
    folderId: integer("folder_id").references(() => saveFolders.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userPostFolderUnique: uniqueIndex("saved_posts_user_post_folder_idx").on(
      table.userId,
      table.postId,
      table.folderId
    ),
  })
);

export const partnerSearchProfiles = pgTable("partner_search_profiles", {
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .primaryKey(),
  danceStyles: danceStyleEnum("dance_styles").array().notNull(),
  height: text("height"),
  location: text("location"),
  bio: text("bio"),
  rolePreference: rolePreferenceEnum("role_preference").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
