import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { getDb } from "@shared/db";
import { users } from "@shared/schema";

/**
 * Ensures a row exists in the users table for the given Clerk user ID.
 * Called from protectedProcedure so that FK constraints on routines and
 * figure_notes are satisfied on first use.
 *
 * On first login, fetches the user's profile from Clerk and populates
 * displayName, username, and avatarUrl.
 */
export async function ensureUser(userId: string) {
  const db = getDb();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId));

  if (!existing) {
    let displayName: string | null = null;
    let username: string | null = null;
    let avatarUrl: string | null = null;

    try {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(userId);

      const first = clerkUser.firstName?.trim() ?? "";
      const last = clerkUser.lastName?.trim() ?? "";
      const fullName = [first, last].filter(Boolean).join(" ");
      displayName = fullName || null;

      username = clerkUser.username ?? null;
      avatarUrl = clerkUser.imageUrl ?? null;
    } catch {
      // If Clerk is unreachable, proceed with bare user ID
    }

    await db.insert(users).values({
      id: userId,
      displayName,
      username,
      avatarUrl,
    });
  }
}
