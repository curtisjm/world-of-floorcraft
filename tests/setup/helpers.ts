import { getTestDb, getTestPool } from "./test-db";
import { appRouter } from "@shared/auth/routers";
import { users } from "@shared/schema";
import { dances, figures } from "@syllabus/schema";
import { posts, partnerSearchProfiles } from "@social/schema";
import { organizations, memberships } from "@orgs/schema";
import { conversations, conversationMembers } from "@messaging/schema";
import {
  competitions,
  competitionDays,
  scheduleBlocks,
  competitionEvents,
  eventDances,
  judges,
  competitionStaff,
  competitionJudges,
  competitionRegistrations,
  entries,
  payments,
  pricingTiers,
  tbaListings,
  teamMatchSubmissions,
  addDropRequests,
  rounds,
  heats,
  heatAssignments,
  eventTimeOverrides,
  callbackMarks,
  finalMarks,
  judgeSubmissions,
  callbackResults,
  finalResults,
  tabulationTables,
  roundResultsMeta,
  judgeSessions,
  activeRounds,
  markCorrections,
  registrationCheckins,
  deckCaptainCheckins,
  announcementNotes,
} from "@competitions/schema";

// ---------- Caller ----------

/**
 * Create an authenticated tRPC caller for a given userId.
 * The user row must exist in the DB (use createUser first).
 */
export function createCaller(userId: string) {
  return appRouter.createCaller({ userId, judgeToken: null });
}

/**
 * Create an unauthenticated tRPC caller (for public procedures).
 */
export function createPublicCaller() {
  return appRouter.createCaller({ userId: null, judgeToken: null });
}

// ---------- Factories ----------

const db = () => getTestDb();

let _userCounter = 0;

export async function createUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  _userCounter++;
  const id = overrides.id ?? `test-user-${_userCounter}-${Date.now()}`;
  const [user] = await db()
    .insert(users)
    .values({
      id,
      username: overrides.username ?? `user${_userCounter}_${Date.now()}`,
      displayName: overrides.displayName ?? `Test User ${_userCounter}`,
      ...overrides,
    })
    .returning();
  return user;
}

export async function createDance(overrides: Partial<typeof dances.$inferInsert> = {}) {
  const [dance] = await db()
    .insert(dances)
    .values({
      name: overrides.name ?? `dance-${Date.now()}`,
      displayName: overrides.displayName ?? "Test Dance",
      ...overrides,
    })
    .returning();
  return dance;
}

export async function createFigure(
  danceId: number,
  overrides: Partial<typeof figures.$inferInsert> = {}
) {
  const [figure] = await db()
    .insert(figures)
    .values({
      danceId,
      name: overrides.name ?? `figure-${Date.now()}`,
      level: overrides.level ?? "associate",
      ...overrides,
    })
    .returning();
  return figure;
}

export async function createPost(
  authorId: string,
  overrides: Partial<typeof posts.$inferInsert> = {}
) {
  const [post] = await db()
    .insert(posts)
    .values({
      authorId,
      type: overrides.type ?? "article",
      title: overrides.title ?? "Test Post",
      body: overrides.body ?? "Test body content",
      publishedAt: overrides.publishedAt ?? new Date(),
      ...overrides,
    })
    .returning();
  return post;
}

export async function createOrg(
  ownerId: string,
  overrides: Partial<typeof organizations.$inferInsert> = {}
) {
  const [org] = await db()
    .insert(organizations)
    .values({
      name: overrides.name ?? `Test Org ${Date.now()}`,
      slug: overrides.slug ?? `test-org-${Date.now()}`,
      ownerId,
      membershipModel: overrides.membershipModel ?? "open",
      ...overrides,
    })
    .returning();

  // Also create owner membership
  await db().insert(memberships).values({
    orgId: org.id,
    userId: ownerId,
    role: "admin",
  });

  return org;
}

export async function createConversation(
  type: "direct" | "group" | "org_channel",
  memberIds: string[],
  overrides: Partial<typeof conversations.$inferInsert> = {}
) {
  const [conv] = await db()
    .insert(conversations)
    .values({ type, ...overrides })
    .returning();

  if (memberIds.length > 0) {
    await db()
      .insert(conversationMembers)
      .values(memberIds.map((userId) => ({ conversationId: conv.id, userId })));
  }

  return conv;
}

let _compCounter = 0;

export async function createCompetition(
  orgId: number,
  createdBy: string,
  overrides: Partial<typeof competitions.$inferInsert> = {},
) {
  _compCounter++;
  const [comp] = await db()
    .insert(competitions)
    .values({
      orgId,
      createdBy,
      name: overrides.name ?? `Test Competition ${_compCounter}`,
      slug: overrides.slug ?? `test-comp-${_compCounter}-${Date.now()}`,
      ...overrides,
    })
    .returning();
  return comp;
}

export async function createJudge(
  overrides: Partial<typeof judges.$inferInsert> = {},
) {
  const [judge] = await db()
    .insert(judges)
    .values({
      firstName: overrides.firstName ?? "Test",
      lastName: overrides.lastName ?? `Judge ${Date.now()}`,
      ...overrides,
    })
    .returning();
  return judge;
}

export async function createRegistration(
  competitionId: number,
  userId: string,
  overrides: Partial<typeof competitionRegistrations.$inferInsert> = {},
) {
  const [reg] = await db()
    .insert(competitionRegistrations)
    .values({
      competitionId,
      userId,
      registeredBy: overrides.registeredBy ?? userId,
      amountOwed: overrides.amountOwed ?? "0",
      ...overrides,
    })
    .returning();
  return reg;
}

// ---------- Cleanup ----------

/**
 * Truncate all tables. Call in beforeEach or beforeAll.
 * Order matters due to foreign key constraints -- truncate with CASCADE.
 */
export async function truncateAll() {
  const pool = getTestPool();
  await pool.query(`
    TRUNCATE
      record_removal_requests,
      feedback_answers,
      feedback_responses,
      feedback_questions,
      feedback_forms,
      registration_checkins,
      deck_captain_checkins,
      announcement_notes,
      mark_corrections,
      active_rounds,
      judge_sessions,
      round_results_meta,
      tabulation_tables,
      final_results,
      callback_results,
      judge_submissions,
      final_marks,
      callback_marks,
      event_time_overrides,
      heat_assignments,
      heats,
      rounds,
      add_drop_requests,
      team_match_submissions,
      tba_listings,
      payments,
      entries,
      competition_registrations,
      pricing_tiers,
      event_dances,
      competition_events,
      schedule_blocks,
      competition_days,
      competition_judges,
      competition_staff,
      judges,
      competitions,
      messages,
      conversation_members,
      conversations,
      notifications,
      saved_posts,
      save_folders,
      likes,
      comments,
      join_requests,
      org_invites,
      memberships,
      organizations,
      routine_entries,
      routines,
      partner_search_profiles,
      follows,
      posts,
      figure_notes,
      figure_edges,
      figures,
      dances,
      users
    CASCADE
  `);
  _userCounter = 0;
  _compCounter = 0;
}
