/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as competitions_addDrop from "../competitions/addDrop.js";
import type * as competitions_awards from "../competitions/awards.js";
import type * as competitions_calendar from "../competitions/calendar.js";
import type * as competitions_compDay from "../competitions/compDay.js";
import type * as competitions_core from "../competitions/core.js";
import type * as competitions_defaultEvents from "../competitions/defaultEvents.js";
import type * as competitions_entries from "../competitions/entries.js";
import type * as competitions_events from "../competitions/events.js";
import type * as competitions_feedback from "../competitions/feedback.js";
import type * as competitions_integrity from "../competitions/integrity.js";
import type * as competitions_judgeSession from "../competitions/judgeSession.js";
import type * as competitions_judges from "../competitions/judges.js";
import type * as competitions_lib_judgeAuth from "../competitions/lib/judgeAuth.js";
import type * as competitions_lib_scoring_engine from "../competitions/lib/scoring/engine.js";
import type * as competitions_lib_scoring_index from "../competitions/lib/scoring/index.js";
import type * as competitions_lib_scoring_types from "../competitions/lib/scoring/types.js";
import type * as competitions_liveView from "../competitions/liveView.js";
import type * as competitions_numbers from "../competitions/numbers.js";
import type * as competitions_orgCompetition from "../competitions/orgCompetition.js";
import type * as competitions_payments from "../competitions/payments.js";
import type * as competitions_recordRemoval from "../competitions/recordRemoval.js";
import type * as competitions_registration from "../competitions/registration.js";
import type * as competitions_results from "../competitions/results.js";
import type * as competitions_rounds from "../competitions/rounds.js";
import type * as competitions_schedule from "../competitions/schedule.js";
import type * as competitions_scheduleEstimation from "../competitions/scheduleEstimation.js";
import type * as competitions_scoring from "../competitions/scoring.js";
import type * as competitions_scrutineer from "../competitions/scrutineer.js";
import type * as competitions_staff from "../competitions/staff.js";
import type * as competitions_stats from "../competitions/stats.js";
import type * as competitions_stripeActions from "../competitions/stripeActions.js";
import type * as competitions_stripeReturnUrls from "../competitions/stripeReturnUrls.js";
import type * as competitions_tba from "../competitions/tba.js";
import type * as competitions_teamMatch from "../competitions/teamMatch.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_postAccess from "../lib/postAccess.js";
import type * as lib_search from "../lib/search.js";
import type * as lib_time from "../lib/time.js";
import type * as messaging from "../messaging.js";
import type * as orgs from "../orgs.js";
import type * as rateLimits from "../rateLimits.js";
import type * as routines from "../routines.js";
import type * as social_comments from "../social/comments.js";
import type * as social_follows from "../social/follows.js";
import type * as social_likes from "../social/likes.js";
import type * as social_notifications from "../social/notifications.js";
import type * as social_partnerSearch from "../social/partnerSearch.js";
import type * as social_posts from "../social/posts.js";
import type * as social_profiles from "../social/profiles.js";
import type * as social_saves from "../social/saves.js";
import type * as syllabus_dances from "../syllabus/dances.js";
import type * as syllabus_figures from "../syllabus/figures.js";
import type * as syllabus_import from "../syllabus/import.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "competitions/addDrop": typeof competitions_addDrop;
  "competitions/awards": typeof competitions_awards;
  "competitions/calendar": typeof competitions_calendar;
  "competitions/compDay": typeof competitions_compDay;
  "competitions/core": typeof competitions_core;
  "competitions/defaultEvents": typeof competitions_defaultEvents;
  "competitions/entries": typeof competitions_entries;
  "competitions/events": typeof competitions_events;
  "competitions/feedback": typeof competitions_feedback;
  "competitions/integrity": typeof competitions_integrity;
  "competitions/judgeSession": typeof competitions_judgeSession;
  "competitions/judges": typeof competitions_judges;
  "competitions/lib/judgeAuth": typeof competitions_lib_judgeAuth;
  "competitions/lib/scoring/engine": typeof competitions_lib_scoring_engine;
  "competitions/lib/scoring/index": typeof competitions_lib_scoring_index;
  "competitions/lib/scoring/types": typeof competitions_lib_scoring_types;
  "competitions/liveView": typeof competitions_liveView;
  "competitions/numbers": typeof competitions_numbers;
  "competitions/orgCompetition": typeof competitions_orgCompetition;
  "competitions/payments": typeof competitions_payments;
  "competitions/recordRemoval": typeof competitions_recordRemoval;
  "competitions/registration": typeof competitions_registration;
  "competitions/results": typeof competitions_results;
  "competitions/rounds": typeof competitions_rounds;
  "competitions/schedule": typeof competitions_schedule;
  "competitions/scheduleEstimation": typeof competitions_scheduleEstimation;
  "competitions/scoring": typeof competitions_scoring;
  "competitions/scrutineer": typeof competitions_scrutineer;
  "competitions/staff": typeof competitions_staff;
  "competitions/stats": typeof competitions_stats;
  "competitions/stripeActions": typeof competitions_stripeActions;
  "competitions/stripeReturnUrls": typeof competitions_stripeReturnUrls;
  "competitions/tba": typeof competitions_tba;
  "competitions/teamMatch": typeof competitions_teamMatch;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/errors": typeof lib_errors;
  "lib/money": typeof lib_money;
  "lib/pagination": typeof lib_pagination;
  "lib/permissions": typeof lib_permissions;
  "lib/postAccess": typeof lib_postAccess;
  "lib/search": typeof lib_search;
  "lib/time": typeof lib_time;
  messaging: typeof messaging;
  orgs: typeof orgs;
  rateLimits: typeof rateLimits;
  routines: typeof routines;
  "social/comments": typeof social_comments;
  "social/follows": typeof social_follows;
  "social/likes": typeof social_likes;
  "social/notifications": typeof social_notifications;
  "social/partnerSearch": typeof social_partnerSearch;
  "social/posts": typeof social_posts;
  "social/profiles": typeof social_profiles;
  "social/saves": typeof social_saves;
  "syllabus/dances": typeof syllabus_dances;
  "syllabus/figures": typeof syllabus_figures;
  "syllabus/import": typeof syllabus_import;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
