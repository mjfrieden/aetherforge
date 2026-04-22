import { audit, getUserByEmail, rateLimit, requireDb } from "../../_lib/db.js";
import { createSession, publicUser } from "../../_lib/auth.js";
import { randomBase64Url } from "../../_lib/encoding.js";
import { clientIpHashInput, json, normalizeEmail, nowIso, readJson } from "../../_lib/http.js";
import {
  hashOpaqueValue,
  hashPassword,
  validateDisplayName,
  validateEmail,
  validatePassword,
} from "../../_lib/security.js";

export async function onRequestPost(context) {
  if (String(context.env.REGISTRATION_DISABLED || "").toLowerCase() === "true") {
    return json({ ok: false, error: "Registration is currently closed." }, 403);
  }

  const ipKey = await hashOpaqueValue(context.env, clientIpHashInput(context.request), "register-rate");
  const limit = await rateLimit(context.env, ipKey, "register", 5, 60 * 60);
  if (!limit.ok) {
    return json({ ok: false, error: "Too many registration attempts. Try later." }, 429);
  }

  let body;
  try {
    body = await readJson(context.request);
  } catch (error) {
    return json({ ok: false, error: error.message }, 400);
  }

  const email = normalizeEmail(body.email);
  const displayName = String(body.display_name || body.displayName || "").trim();
  const password = String(body.password || "");
  const validation =
    validateEmail(email) || validateDisplayName(displayName) || validatePassword(password);
  if (validation) {
    return json({ ok: false, error: validation }, 400);
  }

  const existing = await getUserByEmail(context.env, email);
  if (existing) {
    return json({ ok: false, error: "An account already exists for that email." }, 409);
  }

  const salt = randomBase64Url(18);
  const passwordRecord = await hashPassword(password, salt);
  const userId = randomBase64Url(18);
  const createdAt = nowIso();
  await requireDb(context.env)
    .prepare(
      "INSERT INTO users (id, email, display_name, password_salt, password_hash, password_iterations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(userId, email, displayName, salt, passwordRecord.hash, passwordRecord.iterations, createdAt)
    .run();

  await audit(context.env, userId, "auth.register", {});
  const session = await createSession(context, userId);
  return json(
    {
      ok: true,
      csrf_token: session.csrf,
      user: publicUser({ id: userId, email, display_name: displayName, created_at: createdAt, last_login_at: null }),
    },
    201,
    { "set-cookie": session.cookie },
  );
}
