import { ConvexError } from "convex/values";

/**
 * Extract a user-facing message from an error thrown by a Convex function.
 *
 * Convex functions in this app throw `ConvexError({ code, message })`; the
 * structured payload arrives on `error.data`. Falls back to a plain `Error`
 * message, then to a generic string.
 */
export function convexErrorMessage(
  err: unknown,
  fallback = "Something went wrong",
): string {
  if (err instanceof ConvexError) {
    const data: unknown = err.data;
    if (
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
    ) {
      return (data as { message: string }).message;
    }
    if (typeof data === "string") return data;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
