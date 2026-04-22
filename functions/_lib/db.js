import { nowIso } from "./http.js";
import { randomBase64Url } from "./encoding.js";

export function requireDb(env) {
  if (!env.DB) {
    throw new Error("D1 binding DB is not configured.");
  }
  return env.DB;
}

export async function audit(env, userId, action, metadata = {}) {
  const db = requireDb(env);
  await db
    .prepare(
      "INSERT INTO audit_events (id, user_id, action, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(randomBase64Url(18), userId || null, action, JSON.stringify(metadata), nowIso())
    .run();
}

export async function getUserByEmail(env, email) {
  return requireDb(env)
    .prepare("SELECT * FROM users WHERE email = ?")
    .bind(email)
    .first();
}

export async function getUserById(env, id) {
  return requireDb(env)
    .prepare("SELECT id, email, display_name, created_at, last_login_at FROM users WHERE id = ?")
    .bind(id)
    .first();
}

export async function rateLimit(env, key, bucket, limit, windowSeconds) {
  const db = requireDb(env);
  const now = new Date();
  const existing = await db
    .prepare("SELECT count, reset_at FROM rate_limits WHERE key = ? AND bucket = ?")
    .bind(key, bucket)
    .first();

  if (!existing || new Date(existing.reset_at).getTime() <= now.getTime()) {
    const resetAt = new Date(now.getTime() + windowSeconds * 1000).toISOString();
    await db
      .prepare(
        "INSERT OR REPLACE INTO rate_limits (key, bucket, count, reset_at) VALUES (?, ?, ?, ?)",
      )
      .bind(key, bucket, 1, resetAt)
      .run();
    return { ok: true, remaining: Math.max(limit - 1, 0), reset_at: resetAt };
  }

  if (Number(existing.count) >= limit) {
    return { ok: false, remaining: 0, reset_at: existing.reset_at };
  }

  await db
    .prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ? AND bucket = ?")
    .bind(key, bucket)
    .run();
  return {
    ok: true,
    remaining: Math.max(limit - Number(existing.count) - 1, 0),
    reset_at: existing.reset_at,
  };
}
