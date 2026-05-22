import { ConvexError } from "convex/values";

/**
 * Shared application errors. Each throws a `ConvexError` carrying a stable
 * `code` so clients can branch on failure type, mirroring the tRPC error
 * codes the migration replaces. Return type `never` lets callers use these
 * as control-flow terminators (TypeScript narrows past them).
 */

export function notFound(message = "Not found"): never {
  throw new ConvexError({ code: "NOT_FOUND", message });
}

export function forbidden(message = "Forbidden"): never {
  throw new ConvexError({ code: "FORBIDDEN", message });
}

export function badRequest(message = "Bad request"): never {
  throw new ConvexError({ code: "BAD_REQUEST", message });
}
