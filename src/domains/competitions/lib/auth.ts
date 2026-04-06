import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@shared/db";
import { competitions, competitionStaff } from "@competitions/schema";
import { organizations, memberships } from "@orgs/schema";

/**
 * Check that the user is an org admin/owner for the competition's org,
 * or an assigned scrutineer for this competition.
 *
 * Returns the competition row on success.
 */
export async function requireCompOrgRole(
  competitionId: number,
  userId: string,
): Promise<typeof competitions.$inferSelect> {
  const comp = await db.query.competitions.findFirst({
    where: eq(competitions.id, competitionId),
  });
  if (!comp) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Competition not found" });
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, comp.orgId),
  });
  const membership = await db.query.memberships.findFirst({
    where: and(eq(memberships.orgId, comp.orgId), eq(memberships.userId, userId)),
  });

  const isOwner = org?.ownerId === userId;
  const isAdmin = membership?.role === "admin";
  if (isOwner || isAdmin) return comp;

  const staff = await db.query.competitionStaff.findFirst({
    where: and(
      eq(competitionStaff.competitionId, competitionId),
      eq(competitionStaff.userId, userId),
      eq(competitionStaff.role, "scrutineer"),
    ),
  });
  if (staff) return comp;

  throw new TRPCError({ code: "FORBIDDEN", message: "Org admin/owner or scrutineer required" });
}

/**
 * Check that the user is an org admin/owner, scrutineer, or has a specific
 * staff role for this competition.
 */
export async function requireCompStaffRole(
  competitionId: number,
  userId: string,
  allowedRoles: string[],
): Promise<typeof competitions.$inferSelect> {
  const comp = await db.query.competitions.findFirst({
    where: eq(competitions.id, competitionId),
  });
  if (!comp) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Competition not found" });
  }

  // Org admin/owner always has access
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, comp.orgId),
  });
  const membership = await db.query.memberships.findFirst({
    where: and(eq(memberships.orgId, comp.orgId), eq(memberships.userId, userId)),
  });

  const isOwner = org?.ownerId === userId;
  const isAdmin = membership?.role === "admin";
  if (isOwner || isAdmin) return comp;

  // Check for any of the allowed staff roles (scrutineer always included)
  const allAllowed = [...new Set(["scrutineer", ...allowedRoles])];
  for (const role of allAllowed) {
    const staff = await db.query.competitionStaff.findFirst({
      where: and(
        eq(competitionStaff.competitionId, competitionId),
        eq(competitionStaff.userId, userId),
        eq(competitionStaff.role, role as typeof competitionStaff.$inferSelect.role),
      ),
    });
    if (staff) return comp;
  }

  throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" });
}
