import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getCurrentUser } from "./auth";
import { forbidden, notFound } from "./errors";

type Ctx = QueryCtx | MutationCtx;

/**
 * Organization and competition authorization helpers. These port the
 * semantics of the current tRPC helpers (`src/domains/orgs/lib/auth.ts`,
 * `src/domains/competitions/lib/auth.ts`) to Convex, but resolve the acting
 * user from Convex auth instead of trusting a client-supplied id.
 */

/** Org roles, ranked low→high. `owner` is derived from `organizations.ownerId`. */
export type OrgRole = "member" | "admin" | "owner";

const ORG_ROLE_RANK: Record<OrgRole, number> = {
  member: 0,
  admin: 1,
  owner: 2,
};

/** Competition staff role, as stored on `competitionStaff.role`. */
export type CompetitionStaffRole = Doc<"competitionStaff">["role"];

/**
 * Require the signed-in user to hold at least `minRole` in the organization.
 * Pass `"admin"` for the legacy admin-or-owner behavior of
 * `requireAdminOrOwner`. Throws `NOT_FOUND` if the org is missing and
 * `FORBIDDEN` if the user lacks the required role.
 */
export async function requireOrgRole(
  ctx: Ctx,
  orgId: Id<"organizations">,
  minRole: OrgRole = "member",
): Promise<{ org: Doc<"organizations">; user: Doc<"users">; role: OrgRole }> {
  const user = await getCurrentUser(ctx);
  const org = await ctx.db.get(orgId);
  if (!org) notFound("Organization not found");

  let role: OrgRole;
  if (org.ownerId === user._id) {
    role = "owner";
  } else {
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", orgId).eq("userId", user._id),
      )
      .unique();
    if (!membership) forbidden("Organization membership required");
    role = membership.role;
  }

  if (ORG_ROLE_RANK[role] < ORG_ROLE_RANK[minRole]) {
    forbidden(`Requires ${minRole} role in this organization`);
  }
  return { org, user, role };
}

/**
 * Require the signed-in user to be an org admin/owner for the competition's
 * organization, or an assigned scrutineer for the competition. Mirrors the
 * current `requireCompOrgRole` helper.
 */
export async function requireCompOrgRole(
  ctx: Ctx,
  competitionId: Id<"competitions">,
): Promise<{ competition: Doc<"competitions">; user: Doc<"users"> }> {
  const user = await getCurrentUser(ctx);
  const competition = await ctx.db.get(competitionId);
  if (!competition) notFound("Competition not found");

  const org = await ctx.db.get(competition.orgId);
  if (org && org.ownerId === user._id) return { competition, user };

  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_org_user", (q) =>
      q.eq("orgId", competition.orgId).eq("userId", user._id),
    )
    .unique();
  if (membership?.role === "admin") return { competition, user };

  const scrutineer = await ctx.db
    .query("competitionStaff")
    .withIndex("by_competition_user_role", (q) =>
      q
        .eq("competitionId", competitionId)
        .eq("userId", user._id)
        .eq("role", "scrutineer"),
    )
    .unique();
  if (scrutineer) return { competition, user };

  forbidden("Org admin/owner or scrutineer required");
}

/**
 * Require the signed-in user to be an org admin/owner, a scrutineer, or hold
 * one of `allowedRoles` for the competition. Scrutineer is always allowed,
 * matching the current `requireCompStaffRole` helper.
 */
export async function requireCompStaffRole(
  ctx: Ctx,
  competitionId: Id<"competitions">,
  allowedRoles: CompetitionStaffRole[],
): Promise<{ competition: Doc<"competitions">; user: Doc<"users"> }> {
  const user = await getCurrentUser(ctx);
  const competition = await ctx.db.get(competitionId);
  if (!competition) notFound("Competition not found");

  const org = await ctx.db.get(competition.orgId);
  if (org && org.ownerId === user._id) return { competition, user };

  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_org_user", (q) =>
      q.eq("orgId", competition.orgId).eq("userId", user._id),
    )
    .unique();
  if (membership?.role === "admin") return { competition, user };

  const allowed = new Set<CompetitionStaffRole>([
    "scrutineer",
    ...allowedRoles,
  ]);
  const staffRows = await ctx.db
    .query("competitionStaff")
    .withIndex("by_competition_user_role", (q) =>
      q.eq("competitionId", competitionId).eq("userId", user._id),
    )
    .collect();
  if (staffRows.some((staff) => allowed.has(staff.role))) {
    return { competition, user };
  }

  forbidden("Insufficient competition permissions");
}
