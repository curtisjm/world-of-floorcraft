import { cookies } from "next/headers";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("judge_token")?.value;

  if (token) {
    try {
      await fetchMutation(api.competitions.judgeSession.logout, { token });
    } catch {
      // Best-effort session invalidation — clear cookie regardless
    }
  }

  cookieStore.delete("judge_token");
  return Response.json({ success: true });
}
