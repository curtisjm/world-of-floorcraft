import pg from "pg";
import path from "path";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import * as sharedSchema from "@shared/schema";
import * as syllabusSchema from "@syllabus/schema";
import * as routinesSchema from "@routines/schema";
import * as socialSchema from "@social/schema";
import * as orgsSchema from "@orgs/schema";
import * as messagingSchema from "@messaging/schema";
import * as competitionsSchema from "@competitions/schema";

const schema = {
  ...sharedSchema,
  ...syllabusSchema,
  ...routinesSchema,
  ...socialSchema,
  ...orgsSchema,
  ...messagingSchema,
  ...competitionsSchema,
};

export type TestSchema = typeof schema;

// Construct the URL from known constants so we don't depend on env propagation
// from globalSetup to forked worker processes
const PG_PORT = "5433";
const DB_NAME = "floorcraft_test";
const PG_DIR = path.resolve(process.cwd(), ".pg-test");
const DEFAULT_TEST_URL = `postgresql://${process.env.USER}@localhost:${PG_PORT}/${DB_NAME}?host=${PG_DIR}`;

let _pool: pg.Pool | null = null;
let _db: NodePgDatabase<TestSchema> | null = null;

export function getTestPool(): pg.Pool {
  if (!_pool) {
    _pool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL || DEFAULT_TEST_URL,
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
