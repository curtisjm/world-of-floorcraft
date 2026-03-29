import { execFileSync, execSync } from "child_process";
import fs from "fs";
import path from "path";

const PG_DIR = path.resolve(process.cwd(), ".pg-test");
const PG_DATA = path.join(PG_DIR, "data");
const PG_LOG = path.join(PG_DIR, "postgres.log");
const PG_PORT = "5433";
const DB_NAME = "figuregraph_test";

function pgIsRunning(): boolean {
  try {
    execFileSync("pg_ctl", ["status", "-D", PG_DATA], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export async function setup() {
  // Ensure .pg-test directory exists
  fs.mkdirSync(PG_DIR, { recursive: true });

  // Initialize data directory if needed
  if (!fs.existsSync(path.join(PG_DATA, "PG_VERSION"))) {
    console.log("[test-setup] Initializing PostgreSQL data directory...");
    execFileSync("initdb", ["-D", PG_DATA, "--no-locale", "--encoding=UTF8"], {
      stdio: "pipe",
    });
  }

  // Start PostgreSQL if not already running
  if (!pgIsRunning()) {
    console.log("[test-setup] Starting PostgreSQL on port " + PG_PORT + "...");
    execFileSync("pg_ctl", [
      "start", "-D", PG_DATA, "-l", PG_LOG,
      "-o", `-p ${PG_PORT} -k ${PG_DIR}`,
    ], { stdio: "pipe" });

    // Wait for it to be ready
    for (let i = 0; i < 30; i++) {
      try {
        execFileSync("pg_isready", ["-h", "localhost", "-p", PG_PORT], {
          stdio: "pipe",
        });
        break;
      } catch {
        execSync("sleep 0.2");
      }
    }
  } else {
    console.log("[test-setup] PostgreSQL already running");
  }

  const superuserUrl = `postgresql://${process.env.USER}@localhost:${PG_PORT}/postgres?host=${PG_DIR}`;

  // Create the test database (idempotent)
  try {
    execFileSync("psql", [superuserUrl, "-c", `CREATE DATABASE ${DB_NAME};`], {
      stdio: "pipe",
    });
    console.log("[test-setup] Created database " + DB_NAME);
  } catch {
    // Database already exists
  }

  const testDbUrl = `postgresql://${process.env.USER}@localhost:${PG_PORT}/${DB_NAME}?host=${PG_DIR}`;

  // Push schema using drizzle-kit
  console.log("[test-setup] Pushing schema...");
  execSync("npx drizzle-kit push --force 2>/dev/null || printf 'y\\n' | npx drizzle-kit push", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: testDbUrl },
    shell: "/bin/sh",
  });
  console.log("[test-setup] Schema pushed");

  // Set the URL for test files to use
  process.env.TEST_DATABASE_URL = testDbUrl;
}
