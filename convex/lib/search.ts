import type { Doc } from "../_generated/dataModel";

function normalizeSearchPart(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_\s-]+/g, " ")
    .replace(/[\s-]+/g, " ")
    .trim();
}

/** Build the denormalized profile text used by Convex's user search index. */
export function buildUserSearchText(
  user: Pick<Doc<"users">, "username" | "displayName">,
): string | undefined {
  const searchText = [
    normalizeSearchPart(user.username),
    normalizeSearchPart(user.displayName),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  return searchText || undefined;
}
