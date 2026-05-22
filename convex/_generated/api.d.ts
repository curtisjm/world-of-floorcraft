/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as lib_auth from "../lib/auth.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_time from "../lib/time.js";
import type * as routines from "../routines.js";
import type * as social_follows from "../social/follows.js";
import type * as social_notifications from "../social/notifications.js";
import type * as social_profiles from "../social/profiles.js";
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
  "lib/auth": typeof lib_auth;
  "lib/errors": typeof lib_errors;
  "lib/money": typeof lib_money;
  "lib/pagination": typeof lib_pagination;
  "lib/permissions": typeof lib_permissions;
  "lib/time": typeof lib_time;
  routines: typeof routines;
  "social/follows": typeof social_follows;
  "social/notifications": typeof social_notifications;
  "social/profiles": typeof social_profiles;
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

export declare const components: {};
