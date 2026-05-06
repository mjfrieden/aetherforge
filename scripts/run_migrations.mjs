import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const mode = process.argv[2] === "remote" ? "remote" : "local";
const cwd = process.cwd();
const migrationsDir = path.join(cwd, "migrations");
const dbName = "aetherforge-db";

const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => /^\d+_.+\.sql$/.test(file))
  .sort();

function runWrangler(args, { allowAlreadyApplied = false } = {}) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    cwd,
    encoding: "utf8",
  });

  if (result.status === 0) {
    return result.stdout;
  }

  const stderr = `${result.stderr || ""}\n${result.stdout || ""}`;
  if (allowAlreadyApplied && /duplicate column name|already exists/i.test(stderr)) {
    return stderr;
  }

  process.stderr.write(stderr);
  process.exit(result.status || 1);
}

runWrangler([
  "d1",
  "execute",
  dbName,
  `--${mode}`,
  "--command",
  "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
]);

for (const file of migrationFiles) {
  const existing = runWrangler([
    "d1",
    "execute",
    dbName,
    `--${mode}`,
    "--command",
    `SELECT name FROM schema_migrations WHERE name = '${file}' LIMIT 1`,
    "--json",
  ]);

  if (existing.includes(file)) {
    process.stdout.write(`Skipping ${file}\n`);
    continue;
  }

  process.stdout.write(`Applying ${file}\n`);
  runWrangler(
    [
      "d1",
      "execute",
      dbName,
      `--${mode}`,
      "--file",
      path.join("migrations", file),
    ],
    { allowAlreadyApplied: file === "0004_model_registry.sql" },
  );
  runWrangler([
    "d1",
    "execute",
    dbName,
    `--${mode}`,
    "--command",
    `INSERT OR REPLACE INTO schema_migrations (name, applied_at) VALUES ('${file}', CURRENT_TIMESTAMP)`,
  ]);
}
