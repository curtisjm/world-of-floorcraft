import { neon } from "@neondatabase/serverless";
import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as sharedSchema from "@shared/schema";
import * as syllabusSchema from "@syllabus/schema";
import * as routinesSchema from "@routines/schema";
import * as socialSchema from "@social/schema";
import * as orgsSchema from "@orgs/schema";
import * as messagingSchema from "@messaging/schema";
import * as competitionsSchema from "@competitions/schema";

const schema = { ...sharedSchema, ...syllabusSchema, ...routinesSchema, ...socialSchema, ...orgsSchema, ...messagingSchema, ...competitionsSchema };

let _db: NeonHttpDatabase<typeof schema> | null = null;

export function getDb() {
  if (!_db) {
    const sql = neon(process.env.DATABASE_URL!);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

// Convenience alias for use in routers
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
