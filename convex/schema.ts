import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * World of Floorcraft — Convex schema.
 *
 * Ported from the legacy SQL schema during the Convex migration
 * (docs/superpowers/plans/2026-05-22-convex-migration.md, Task 2). Every
 * current domain table is represented here so domain workers can implement
 * functions without editing this shared file.
 *
 * Conventions:
 * - Legacy serial ids are dropped; the Convex document `_id` replaces
 *   them. Foreign keys become `v.id("targetTable")`.
 * - SQL enums become `v.union(v.literal(...))` validators, exported below
 *   for reuse by domain functions and tests.
 * - Legacy timestamp columns become epoch-millisecond `v.number()`.
 *   Calendar `date` columns become `"YYYY-MM-DD"` strings.
 * - Money columns are stored as integer cents (`v.number()`); convert with
 *   the helpers in `convex/lib/money.ts`.
 * - Legacy unique indexes become regular Convex indexes — uniqueness is
 *   enforced in application code.
 */

// ── Enum-like value validators ──────────────────────────────────────

/** Competitor skill level (competition entries). */
export const competitionLevel = v.union(
  v.literal("newcomer"),
  v.literal("bronze"),
  v.literal("silver"),
  v.literal("gold"),
  v.literal("novice"),
  v.literal("prechamp"),
  v.literal("champ"),
  v.literal("professional"),
);

/** Syllabus figure level (ISTD-style teaching grades). */
export const figureLevel = v.union(
  v.literal("student_teacher"),
  v.literal("associate"),
  v.literal("licentiate"),
  v.literal("fellow"),
);

export const wallSegment = v.union(
  v.literal("long1"),
  v.literal("short1"),
  v.literal("long2"),
  v.literal("short2"),
);

export const membershipModel = v.union(
  v.literal("open"),
  v.literal("invite"),
  v.literal("request"),
);

export const orgRole = v.union(v.literal("member"), v.literal("admin"));

export const inviteStatus = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("declined"),
  v.literal("expired"),
);

export const joinRequestStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);

export const conversationType = v.union(
  v.literal("direct"),
  v.literal("group"),
  v.literal("org_channel"),
);

export const notificationType = v.union(
  v.literal("like"),
  v.literal("comment"),
  v.literal("reply"),
  v.literal("follow"),
  v.literal("follow_request"),
  v.literal("follow_accepted"),
  v.literal("message"),
  v.literal("org_invite"),
  v.literal("join_request"),
  v.literal("join_approved"),
  v.literal("org_post"),
);

export const followStatus = v.union(
  v.literal("active"),
  v.literal("pending"),
);

export const postType = v.union(
  v.literal("routine_share"),
  v.literal("article"),
);

export const visibility = v.union(
  v.literal("public"),
  v.literal("followers"),
  v.literal("organization"),
);

export const competitionStatus = v.union(
  v.literal("draft"),
  v.literal("advertised"),
  v.literal("accepting_entries"),
  v.literal("entries_closed"),
  v.literal("running"),
  v.literal("finished"),
  v.literal("archived"),
);

export const scheduleBlockType = v.union(
  v.literal("session"),
  v.literal("break"),
);

export const competitionStaffRole = v.union(
  v.literal("scrutineer"),
  v.literal("chairman"),
  v.literal("judge"),
  v.literal("emcee"),
  v.literal("deck_captain"),
  v.literal("registration"),
  v.literal("dj"),
);

export const danceStyle = v.union(
  v.literal("standard"),
  v.literal("smooth"),
  v.literal("latin"),
  v.literal("rhythm"),
  v.literal("nightclub"),
);

export const eventType = v.union(
  v.literal("single_dance"),
  v.literal("multi_dance"),
);

export const pricingModel = v.union(
  v.literal("flat_fee"),
  v.literal("per_event"),
);

export const danceRole = v.union(
  v.literal("leader"),
  v.literal("follower"),
);

export const rolePreference = v.union(
  v.literal("lead"),
  v.literal("follow"),
  v.literal("both"),
);

export const paymentMethod = v.union(
  v.literal("online"),
  v.literal("cash"),
  v.literal("check"),
  v.literal("other"),
);

export const addDropType = v.union(v.literal("add"), v.literal("drop"));

export const addDropStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);

export const roundStatus = v.union(
  v.literal("pending"),
  v.literal("in_progress"),
  v.literal("completed"),
);

export const roundType = v.union(
  v.literal("1st_round"),
  v.literal("2nd_round"),
  v.literal("quarter_final"),
  v.literal("semi_final"),
  v.literal("final"),
);

export const markStatus = v.union(
  v.literal("pending"),
  v.literal("submitted"),
  v.literal("confirmed"),
);

export const resultStatus = v.union(
  v.literal("computed"),
  v.literal("reviewed"),
  v.literal("published"),
);

export const judgeSessionStatus = v.union(
  v.literal("active"),
  v.literal("ended"),
);

export const markCorrectionSource = v.union(
  v.literal("scrutineer"),
  v.literal("judge"),
);

export const announcementNoteType = v.union(
  v.literal("text"),
  v.literal("break"),
);

export const feedbackQuestionType = v.union(
  v.literal("text"),
  v.literal("rating"),
  v.literal("multiple_choice"),
  v.literal("yes_no"),
);

export const recordRemovalStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);

// ── Schema ──────────────────────────────────────────────────────────

export default defineSchema({
  // ── Shared ────────────────────────────────────────────────────────

  // Clerk-authenticated app users. `tokenIdentifier` is the stable Convex
  // auth key (`identity.tokenIdentifier`); `clerkUserId` keeps the raw
  // Clerk subject for compatibility with existing Clerk-ID semantics.
  users: defineTable({
    tokenIdentifier: v.string(),
    clerkUserId: v.string(),
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    bio: v.optional(v.string()),
    competitionLevel: v.optional(competitionLevel),
    competitionLevelHigh: v.optional(competitionLevel),
    searchText: v.optional(v.string()),
    isPrivate: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_username", ["username"])
    .searchIndex("search_profile", { searchField: "searchText" }),

  notifications: defineTable({
    userId: v.id("users"),
    type: notificationType,
    actorId: v.optional(v.id("users")),
    postId: v.optional(v.id("posts")),
    commentId: v.optional(v.id("comments")),
    orgId: v.optional(v.id("organizations")),
    conversationId: v.optional(v.id("conversations")),
    read: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_read", ["userId", "read"]),

  // ── Syllabus ──────────────────────────────────────────────────────

  dances: defineTable({
    name: v.string(),
    displayName: v.string(),
    timeSignature: v.optional(v.string()),
    tempoDescription: v.optional(v.string()),
  }).index("by_name", ["name"]),

  figures: defineTable({
    danceId: v.id("dances"),
    figureNumber: v.optional(v.number()),
    name: v.string(),
    variantName: v.optional(v.string()),
    level: figureLevel,
    // Step payloads stay product-shaped JSON; the OCR redesign is out of
    // scope and may reshape these later.
    leaderSteps: v.optional(v.any()),
    followerSteps: v.optional(v.any()),
    leaderFootwork: v.optional(v.string()),
    followerFootwork: v.optional(v.string()),
    leaderCbm: v.optional(v.string()),
    followerCbm: v.optional(v.string()),
    leaderSway: v.optional(v.string()),
    followerSway: v.optional(v.string()),
    timing: v.optional(v.string()),
    beatValue: v.optional(v.string()),
    notes: v.optional(v.array(v.string())),
  })
    .index("by_dance", ["danceId"])
    .index("by_dance_level", ["danceId", "level"]),

  figureEdges: defineTable({
    sourceFigureId: v.id("figures"),
    targetFigureId: v.id("figures"),
    level: figureLevel,
    conditions: v.optional(v.string()),
  })
    .index("by_source", ["sourceFigureId"])
    .index("by_target", ["targetFigureId"])
    .index("by_source_level", ["sourceFigureId", "level"]),

  figureNotes: defineTable({
    userId: v.id("users"),
    figureId: v.id("figures"),
    content: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_figure", ["figureId"])
    .index("by_user_figure", ["userId", "figureId"]),

  // ── Routines ──────────────────────────────────────────────────────

  routines: defineTable({
    userId: v.id("users"),
    danceId: v.id("dances"),
    name: v.string(),
    description: v.optional(v.string()),
    isPublished: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_dance", ["danceId"]),

  routineEntries: defineTable({
    routineId: v.id("routines"),
    figureId: v.id("figures"),
    position: v.number(),
    wallSegment: v.optional(wallSegment),
    notes: v.optional(v.string()),
  })
    .index("by_routine", ["routineId"])
    .index("by_routine_position", ["routineId", "position"]),

  // ── Social ────────────────────────────────────────────────────────

  follows: defineTable({
    followerId: v.id("users"),
    followingId: v.id("users"),
    status: followStatus,
    createdAt: v.number(),
  })
    .index("by_follower", ["followerId"])
    .index("by_following", ["followingId"])
    .index("by_follower_following", ["followerId", "followingId"]),

  posts: defineTable({
    authorId: v.optional(v.id("users")),
    orgId: v.optional(v.id("organizations")),
    type: postType,
    visibility: visibility,
    visibilityOrgId: v.optional(v.id("organizations")),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    routineId: v.optional(v.id("routines")),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_author", ["authorId"])
    .index("by_author_published", ["authorId", "publishedAt"])
    .index("by_author_type_published", ["authorId", "type", "publishedAt"])
    .index("by_type", ["type"])
    .index("by_published", ["publishedAt"])
    .index("by_visibility_published", ["visibility", "publishedAt"])
    .index("by_visibility_org_published", [
      "visibility",
      "visibilityOrgId",
      "publishedAt",
    ])
    .index("by_org", ["orgId"])
    .index("by_org_published", ["orgId", "publishedAt"])
    .index("by_org_visibility_published", ["orgId", "visibility", "publishedAt"]),

  comments: defineTable({
    postId: v.id("posts"),
    authorId: v.id("users"),
    parentId: v.optional(v.id("comments")),
    body: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_parent", ["parentId"]),

  likes: defineTable({
    userId: v.id("users"),
    postId: v.optional(v.id("posts")),
    commentId: v.optional(v.id("comments")),
    createdAt: v.number(),
  })
    .index("by_user_post", ["userId", "postId"])
    .index("by_user_comment", ["userId", "commentId"])
    .index("by_post", ["postId"])
    .index("by_comment", ["commentId"]),

  saveFolders: defineTable({
    userId: v.id("users"),
    name: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  savedPosts: defineTable({
    userId: v.id("users"),
    postId: v.id("posts"),
    folderId: v.optional(v.id("saveFolders")),
    createdAt: v.number(),
  })
    .index("by_user_post", ["userId", "postId"])
    .index("by_post", ["postId"])
    .index("by_folder", ["folderId"]),

  partnerSearchProfiles: defineTable({
    userId: v.id("users"),
    danceStyles: v.array(danceStyle),
    height: v.optional(v.string()),
    location: v.optional(v.string()),
    bio: v.optional(v.string()),
    rolePreference: rolePreference,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_updated", ["updatedAt"])
    .index("by_role_updated", ["rolePreference", "updatedAt"]),

  partnerSearchStyleProfiles: defineTable({
    profileId: v.id("partnerSearchProfiles"),
    userId: v.id("users"),
    style: danceStyle,
    rolePreference: rolePreference,
    updatedAt: v.number(),
  })
    .index("by_profile", ["profileId"])
    .index("by_style_updated", ["style", "updatedAt"])
    .index("by_style_role_updated", ["style", "rolePreference", "updatedAt"]),

  partnerSearchLocationTokens: defineTable({
    profileId: v.id("partnerSearchProfiles"),
    userId: v.id("users"),
    token: v.string(),
    rolePreference: rolePreference,
    updatedAt: v.number(),
  })
    .index("by_profile", ["profileId"])
    .index("by_token_updated", ["token", "updatedAt"])
    .index("by_token_role_updated", ["token", "rolePreference", "updatedAt"]),

  // ── Organizations ─────────────────────────────────────────────────

  organizations: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    membershipModel: membershipModel,
    ownerId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  memberships: defineTable({
    orgId: v.id("organizations"),
    userId: v.id("users"),
    role: orgRole,
    createdAt: v.number(),
  })
    .index("by_org_user", ["orgId", "userId"])
    .index("by_user", ["userId"]),

  orgInvites: defineTable({
    orgId: v.id("organizations"),
    invitedUserId: v.optional(v.id("users")),
    invitedBy: v.id("users"),
    token: v.optional(v.string()),
    status: inviteStatus,
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_token", ["token"])
    .index("by_invited_user", ["invitedUserId"]),

  joinRequests: defineTable({
    orgId: v.id("organizations"),
    userId: v.id("users"),
    status: joinRequestStatus,
    reviewedBy: v.optional(v.id("users")),
    createdAt: v.number(),
    reviewedAt: v.optional(v.number()),
  })
    .index("by_org_user", ["orgId", "userId"])
    .index("by_user", ["userId"]),

  // ── Messaging ─────────────────────────────────────────────────────

  conversations: defineTable({
    type: conversationType,
    name: v.optional(v.string()),
    orgId: v.optional(v.id("organizations")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["orgId"]),

  conversationMembers: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    joinedAt: v.number(),
    lastReadAt: v.optional(v.number()),
    unreadCount: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_conversation_user", ["conversationId", "userId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    senderId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
  }).index("by_conversation", ["conversationId"]),

  // Ephemeral heartbeat records kept in their own tables so frequent
  // writes never invalidate conversation/user documents.
  conversationPresence: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    lastSeenAt: v.number(),
  })
    .index("by_conversation_user", ["conversationId", "userId"])
    .index("by_last_seen", ["lastSeenAt"]),

  conversationTyping: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_conversation_user", ["conversationId", "userId"])
    .index("by_updated", ["updatedAt"]),

  // ── Competitions ──────────────────────────────────────────────────

  competitions: defineTable({
    orgId: v.id("organizations"),
    createdBy: v.id("users"),
    name: v.string(),
    slug: v.string(),
    status: competitionStatus,
    description: v.optional(v.string()),
    rules: v.optional(v.string()),
    venueName: v.optional(v.string()),
    streetAddress: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    country: v.optional(v.string()),
    venueNotes: v.optional(v.string()),
    maxFinalSize: v.optional(v.number()),
    maxHeatSize: v.optional(v.number()),
    baseFee: v.optional(v.number()), // cents
    numberStart: v.optional(v.number()),
    numberExclusions: v.optional(v.array(v.number())),
    pricingModel: pricingModel,
    requirePaymentAtRegistration: v.boolean(),
    stripeAccountId: v.optional(v.string()),
    stripeOnboardingComplete: v.boolean(),
    minutesPerCouplePerDance: v.optional(v.number()),
    transitionMinutes: v.optional(v.number()),
    compCode: v.optional(v.string()),
    masterPasswordHash: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_comp_code", ["compCode"])
    .index("by_org", ["orgId"])
    .index("by_status", ["status"])
    .index("by_status_state", ["status", "state"])
    .index("by_org_status", ["orgId", "status"]),

  competitionDays: defineTable({
    competitionId: v.id("competitions"),
    date: v.string(), // "YYYY-MM-DD"
    label: v.optional(v.string()),
    position: v.number(),
  }).index("by_competition_position", ["competitionId", "position"]),

  scheduleBlocks: defineTable({
    dayId: v.id("competitionDays"),
    type: scheduleBlockType,
    label: v.string(),
    position: v.number(),
    estimatedStartTime: v.optional(v.number()),
    estimatedEndTime: v.optional(v.number()),
  }).index("by_day_position", ["dayId", "position"]),

  competitionEvents: defineTable({
    competitionId: v.id("competitions"),
    sessionId: v.optional(v.id("scheduleBlocks")),
    name: v.string(),
    style: danceStyle,
    level: competitionLevel,
    eventType: eventType,
    position: v.optional(v.number()),
    maxFinalSize: v.optional(v.number()),
    maxHeatSize: v.optional(v.number()),
    entryPrice: v.optional(v.number()), // cents
  })
    .index("by_competition", ["competitionId"])
    .index("by_session", ["sessionId"]),

  eventDances: defineTable({
    eventId: v.id("competitionEvents"),
    danceName: v.string(),
    position: v.number(),
  }).index("by_event_position", ["eventId", "position"]),

  // Global judge directory (independent of app users).
  judges: defineTable({
    firstName: v.string(),
    lastName: v.string(),
    initials: v.optional(v.string()),
    affiliation: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_name", ["lastName", "firstName"]),

  competitionStaff: defineTable({
    competitionId: v.id("competitions"),
    userId: v.id("users"),
    role: competitionStaffRole,
    createdAt: v.number(),
  })
    .index("by_competition_user_role", ["competitionId", "userId", "role"])
    .index("by_user", ["userId"]),

  competitionJudges: defineTable({
    competitionId: v.id("competitions"),
    judgeId: v.id("judges"),
    createdAt: v.number(),
  }).index("by_competition_judge", ["competitionId", "judgeId"]),

  pricingTiers: defineTable({
    competitionId: v.id("competitions"),
    name: v.string(),
    price: v.number(), // cents
    position: v.optional(v.number()),
  }).index("by_competition", ["competitionId"]),

  competitionRegistrations: defineTable({
    competitionId: v.id("competitions"),
    userId: v.id("users"),
    competitorNumber: v.optional(v.number()),
    pricingTierId: v.optional(v.id("pricingTiers")),
    amountOwed: v.number(), // cents
    paidConfirmed: v.boolean(),
    checkedIn: v.boolean(),
    orgId: v.optional(v.id("organizations")),
    registeredAt: v.number(),
    registeredBy: v.id("users"),
    cancelled: v.boolean(),
  })
    .index("by_competition_user", ["competitionId", "userId"])
    .index("by_user", ["userId"])
    .index("by_competition_number", ["competitionId", "competitorNumber"])
    .index("by_competition_org", ["competitionId", "orgId"]),

  entries: defineTable({
    competitionId: v.optional(v.id("competitions")),
    eventId: v.id("competitionEvents"),
    leaderRegistrationId: v.id("competitionRegistrations"),
    followerRegistrationId: v.id("competitionRegistrations"),
    createdAt: v.number(),
    createdBy: v.id("users"),
    scratched: v.boolean(),
  })
    .index("by_competition", ["competitionId"])
    .index("by_competition_event", ["competitionId", "eventId"])
    .index("by_event", ["eventId"])
    .index("by_leader", ["leaderRegistrationId"])
    .index("by_follower", ["followerRegistrationId"])
    .index("by_event_couple", [
      "eventId",
      "leaderRegistrationId",
      "followerRegistrationId",
    ]),

  payments: defineTable({
    competitionId: v.optional(v.id("competitions")),
    registrationId: v.id("competitionRegistrations"),
    amount: v.number(), // cents
    method: paymentMethod,
    note: v.optional(v.string()),
    entryId: v.optional(v.id("entries")),
    stripePaymentIntentId: v.optional(v.string()),
    // Recorded for idempotent Stripe webhook fulfillment (Task 11).
    stripeCheckoutSessionId: v.optional(v.string()),
    processedBy: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_competition", ["competitionId"])
    .index("by_competition_registration", ["competitionId", "registrationId"])
    .index("by_registration", ["registrationId"])
    .index("by_stripe_checkout_session", ["stripeCheckoutSessionId"])
    .index("by_stripe_payment_intent", ["stripePaymentIntentId"]),

  stripeCheckoutSessions: defineTable({
    stripeCheckoutSessionId: v.string(),
    stripePaymentIntentId: v.optional(v.string()),
    competitionId: v.id("competitions"),
    registrationIds: v.array(v.id("competitionRegistrations")),
    callerUserId: v.id("users"),
    amountTotal: v.number(), // cents expected at Checkout creation time
    status: v.union(v.literal("pending"), v.literal("fulfilled")),
    paymentId: v.optional(v.id("payments")),
    createdAt: v.number(),
    updatedAt: v.number(),
    fulfilledAt: v.optional(v.number()),
  })
    .index("by_competition", ["competitionId"])
    .index("by_stripe_checkout_session", ["stripeCheckoutSessionId"])
    .index("by_stripe_payment_intent", ["stripePaymentIntentId"]),

  tbaListings: defineTable({
    competitionId: v.id("competitions"),
    userId: v.id("users"),
    style: danceStyle,
    level: competitionLevel,
    role: danceRole,
    notes: v.optional(v.string()),
    fulfilled: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_competition_fulfilled", ["competitionId", "fulfilled"])
    .index("by_user", ["userId"]),

  teamMatchSubmissions: defineTable({
    competitionId: v.id("competitions"),
    userId: v.id("users"),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_competition", ["competitionId"]),

  addDropRequests: defineTable({
    competitionId: v.id("competitions"),
    submittedBy: v.id("users"),
    type: addDropType,
    eventId: v.id("competitionEvents"),
    leaderRegistrationId: v.id("competitionRegistrations"),
    followerRegistrationId: v.id("competitionRegistrations"),
    reason: v.optional(v.string()),
    reviewNotes: v.optional(v.string()),
    status: addDropStatus,
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    affectsRounds: v.optional(v.boolean()),
    createdAt: v.number(),
  }).index("by_competition_status", ["competitionId", "status"]),

  rounds: defineTable({
    eventId: v.id("competitionEvents"),
    roundType: roundType,
    position: v.number(),
    callbacksRequested: v.optional(v.number()),
    status: roundStatus,
    heatsApproved: v.boolean(),
  }).index("by_event_position", ["eventId", "position"]),

  heats: defineTable({
    roundId: v.id("rounds"),
    heatNumber: v.number(),
    status: roundStatus,
  }).index("by_round_number", ["roundId", "heatNumber"]),

  heatAssignments: defineTable({
    heatId: v.id("heats"),
    entryId: v.id("entries"),
  })
    .index("by_heat_entry", ["heatId", "entryId"])
    .index("by_entry", ["entryId"]),

  eventTimeOverrides: defineTable({
    eventId: v.id("competitionEvents"),
    estimatedMinutes: v.number(),
  }).index("by_event", ["eventId"]),

  callbackMarks: defineTable({
    roundId: v.id("rounds"),
    judgeId: v.id("judges"),
    entryId: v.id("entries"),
    marked: v.boolean(),
  }).index("by_round_judge_entry", ["roundId", "judgeId", "entryId"]),

  finalMarks: defineTable({
    roundId: v.id("rounds"),
    judgeId: v.id("judges"),
    entryId: v.id("entries"),
    danceName: v.string(),
    placement: v.number(),
  })
    .index("by_round_judge_entry_dance", [
      "roundId",
      "judgeId",
      "entryId",
      "danceName",
    ])
    .index("by_round_judge_dance_placement", [
      "roundId",
      "judgeId",
      "danceName",
      "placement",
    ]),

  judgeSubmissions: defineTable({
    roundId: v.id("rounds"),
    judgeId: v.id("judges"),
    status: markStatus,
    submittedAt: v.optional(v.number()),
    confirmedAt: v.optional(v.number()),
  }).index("by_round_judge", ["roundId", "judgeId"]),

  callbackResults: defineTable({
    roundId: v.id("rounds"),
    entryId: v.id("entries"),
    totalMarks: v.number(),
    advanced: v.boolean(),
  }).index("by_round_entry", ["roundId", "entryId"]),

  finalResults: defineTable({
    roundId: v.id("rounds"),
    entryId: v.id("entries"),
    danceName: v.optional(v.string()),
    placement: v.number(),
    placementValue: v.optional(v.number()),
    tiebreakRule: v.optional(v.string()),
  })
    .index("by_round_entry_dance", ["roundId", "entryId", "danceName"])
    .index("by_round_placement", ["roundId", "placement"]),

  tabulationTables: defineTable({
    roundId: v.id("rounds"),
    entryId: v.id("entries"),
    danceName: v.optional(v.string()),
    tableData: v.any(),
  }).index("by_round_entry_dance", ["roundId", "entryId", "danceName"]),

  roundResultsMeta: defineTable({
    roundId: v.id("rounds"),
    status: resultStatus,
    computedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
  }).index("by_round", ["roundId"]),

  judgeSessions: defineTable({
    competitionId: v.id("competitions"),
    judgeId: v.id("judges"),
    status: judgeSessionStatus,
    tokenHash: v.string(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  }).index("by_competition_judge", ["competitionId", "judgeId"]),

  activeRounds: defineTable({
    competitionId: v.id("competitions"),
    roundId: v.id("rounds"),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_competition", ["competitionId"])
    .index("by_round", ["roundId"]),

  markCorrections: defineTable({
    roundId: v.id("rounds"),
    judgeId: v.id("judges"),
    entryId: v.id("entries"),
    danceName: v.optional(v.string()),
    oldValue: v.string(),
    newValue: v.string(),
    source: markCorrectionSource,
    correctedBy: v.optional(v.id("users")),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_round", ["roundId"]),

  registrationCheckins: defineTable({
    registrationId: v.id("competitionRegistrations"),
    checkedInBy: v.id("users"),
    checkedInAt: v.number(),
  }).index("by_registration", ["registrationId"]),

  deckCaptainCheckins: defineTable({
    roundId: v.id("rounds"),
    entryId: v.id("entries"),
    status: v.string(),
    checkedInBy: v.id("users"),
    updatedAt: v.number(),
  }).index("by_round_entry", ["roundId", "entryId"]),

  announcementNotes: defineTable({
    competitionId: v.id("competitions"),
    dayId: v.id("competitionDays"),
    positionAfterEventId: v.optional(v.id("competitionEvents")),
    type: announcementNoteType,
    content: v.string(),
    createdBy: v.id("users"),
    visibleOnProjector: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_competition_day", ["competitionId", "dayId"]),

  feedbackForms: defineTable({
    competitionId: v.id("competitions"),
    title: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_competition", ["competitionId"]),

  feedbackQuestions: defineTable({
    formId: v.id("feedbackForms"),
    questionType: feedbackQuestionType,
    label: v.string(),
    options: v.optional(v.array(v.string())),
    required: v.boolean(),
    position: v.number(),
  }).index("by_form_position", ["formId", "position"]),

  feedbackResponses: defineTable({
    formId: v.id("feedbackForms"),
    userId: v.id("users"),
    submittedAt: v.number(),
  }).index("by_form_user", ["formId", "userId"]),

  feedbackAnswers: defineTable({
    responseId: v.id("feedbackResponses"),
    questionId: v.id("feedbackQuestions"),
    value: v.string(),
  }).index("by_response_question", ["responseId", "questionId"]),

  recordRemovalRequests: defineTable({
    userId: v.id("users"),
    competitionId: v.id("competitions"),
    entryId: v.optional(v.id("entries")),
    reason: v.string(),
    status: recordRemovalStatus,
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    reviewNotes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user_competition", ["userId", "competitionId"])
    .index("by_competition", ["competitionId"]),
});
