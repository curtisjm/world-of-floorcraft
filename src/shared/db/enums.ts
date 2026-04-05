import { pgEnum } from "drizzle-orm/pg-core";

export const competitionLevelEnum = pgEnum("competition_level", [
  "newcomer", "bronze", "silver", "gold", "novice", "prechamp", "champ", "professional",
]);

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

export const membershipModelEnum = pgEnum("membership_model", [
  "open",
  "invite",
  "request",
]);

export const orgRoleEnum = pgEnum("org_role", ["member", "admin"]);

export const inviteStatusEnum = pgEnum("invite_status", [
  "pending",
  "accepted",
  "declined",
  "expired",
]);

export const joinRequestStatusEnum = pgEnum("join_request_status", [
  "pending",
  "approved",
  "rejected",
]);

export const conversationTypeEnum = pgEnum("conversation_type", [
  "direct",
  "group",
  "org_channel",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "like",
  "comment",
  "reply",
  "follow",
  "follow_request",
  "follow_accepted",
  "message",
  "org_invite",
  "join_request",
  "join_approved",
  "org_post",
]);

// ── Competition domain ──────────────────────────────────────────────

export const competitionStatusEnum = pgEnum("competition_status", [
  "draft",
  "advertised",
  "accepting_entries",
  "entries_closed",
  "running",
  "finished",
]);

export const scheduleBlockTypeEnum = pgEnum("schedule_block_type", [
  "session",
  "break",
]);

export const competitionStaffRoleEnum = pgEnum("competition_staff_role", [
  "scrutineer",
  "chairman",
  "judge",
  "emcee",
  "deck_captain",
  "registration",
]);

export const danceStyleEnum = pgEnum("dance_style", [
  "standard",
  "smooth",
  "latin",
  "rhythm",
  "nightclub",
]);

export const eventTypeEnum = pgEnum("event_type", [
  "single_dance",
  "multi_dance",
]);

export const pricingModelEnum = pgEnum("pricing_model", [
  "flat_fee",
  "per_event",
]);

export const danceRoleEnum = pgEnum("dance_role", [
  "leader",
  "follower",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "online",
  "cash",
  "check",
  "other",
]);

export const addDropTypeEnum = pgEnum("add_drop_type", [
  "add",
  "drop",
]);

export const addDropStatusEnum = pgEnum("add_drop_status", [
  "pending",
  "approved",
  "rejected",
]);

export const roundStatusEnum = pgEnum("round_status", [
  "pending",
  "in_progress",
  "completed",
]);

export const roundTypeEnum = pgEnum("round_type", [
  "1st_round",
  "2nd_round",
  "quarter_final",
  "semi_final",
  "final",
]);

export const markStatusEnum = pgEnum("mark_status", [
  "pending",
  "submitted",
  "confirmed",
]);

export const resultStatusEnum = pgEnum("result_status", [
  "computed",
  "reviewed",
  "published",
]);

export const judgeSessionStatusEnum = pgEnum("judge_session_status", [
  "active",
  "ended",
]);

export const markCorrectionSourceEnum = pgEnum("mark_correction_source", [
  "scrutineer",
  "judge",
]);

export const checkinTypeEnum = pgEnum("checkin_type", [
  "registration",
  "deck_captain",
]);

export const announcementNoteTypeEnum = pgEnum("announcement_note_type", [
  "text",
  "break",
]);
