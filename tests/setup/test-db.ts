import pg from "pg";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import * as sharedSchema from "@shared/schema";
import * as syllabusSchema from "@syllabus/schema";
import * as routinesSchema from "@routines/schema";
import * as socialSchema from "@social/schema";
import * as orgsSchema from "@orgs/schema";
import * as messagingSchema from "@messaging/schema";

const schema = {
  ...sharedSchema,
  ...syllabusSchema,
  ...routinesSchema,
  ...socialSchema,
  ...orgsSchema,
  ...messagingSchema,
};

export type TestSchema = typeof schema;

let _pool: pg.Pool | null = null;
let _db: NodePgDatabase<TestSchema> | null = null;

export function getTestPool(): pg.Pool {
  if (!_pool) {
    _pool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
  }
  return _pool;
}

export function getTestDb(): NodePgDatabase<TestSchema> {
  if (!_db) {
    _db = drizzle(getTestPool(), { schema });
  }
  return _db;
}

export async function closeTestDb() {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
