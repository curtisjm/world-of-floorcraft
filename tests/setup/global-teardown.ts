import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";

const PG_DIR = path.resolve(process.cwd(), ".pg-test");
const PG_DATA = path.join(PG_DIR, "data");

export async function teardown() {
  if (!fs.existsSync(PG_DATA)) return;

  try {
    execFileSync("pg_ctl", ["stop", "-D", PG_DATA, "-m", "fast"], {
      stdio: "pipe",
    });
    console.log("[test-teardown] PostgreSQL stopped");
  } catch {
    // Already stopped
  }
}
