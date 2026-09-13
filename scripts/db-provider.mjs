#!/usr/bin/env node
// ─── Database provider switch ────────────────────────────────────────────────
// The app ships with SQLite for zero-setup local development. On Vercel (or any
// serverless host) the filesystem is ephemeral, so production should point
// DATABASE_URL at a hosted Postgres (Neon / Vercel Postgres / Supabase …).
//
// Prisma requires the provider to be hardcoded in schema.prisma, so this script
// rewrites it automatically based on the DATABASE_URL protocol:
//   postgres:// or postgresql://  →  provider = "postgresql"
//   anything else (or unset)     →  provider = "sqlite"   (local dev)
//
// Runs from `postinstall` and `build` — safe to run any number of times.

import { readFileSync, writeFileSync } from "node:fs";

const url = process.env.DATABASE_URL || "";
const isPostgres = /^postgres(ql)?:\/\//.test(url);

const schemaPath = new URL("../prisma/schema.prisma", import.meta.url);
let schema = readFileSync(schemaPath, "utf8");

if (isPostgres) {
  schema = schema.replace('provider = "sqlite"', 'provider = "postgresql"');
  // Normalize back in case of a re-run
  schema = schema.replace('provider = "postgresql"', 'provider = "postgresql"');
} else {
  schema = schema.replace('provider = "postgresql"', 'provider = "sqlite"');
}

writeFileSync(schemaPath, schema);
console.log(
  `[db-provider] DATABASE_URL detected as ${isPostgres ? "postgres:// — provider switched to postgresql" : "local/sqlite — provider stays sqlite"}`
);
