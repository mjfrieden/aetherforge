import { audit, getUserByEmail, rateLimit, requireDb } from "../../_lib/db.js";
import { createSession, publicUser } from "../../_lib/auth.js";
import { clientIpHashInput, json, normalizeEmail, nowIso, readJson } from "../../_lib/http.js";
import { hashOpaqueValue, verifyPassword } from "../../_lib/security.js";

export async function onRequestPost(context) {
  const ipKey = await hashOpaqueValue(context.env, clientIpHashInput(context.request), "login-rate");
  const limit = await rateLimit(context.env, ipKey, "login", 12, 15 * 60);
  if (!limit.ok) {
    return json({ ok: false, error: "Too many login attempts. Try later." }, 429);
  }

  let body;
  try {
    body = await readJson(context.request);
  } catch (error) {
    return json({ ok: false, error: error.message }, 400);
  }

  const email = normalizeEmail(body.email);
  const user = await getUserByEmail(context.env, email);
  const valid =
    user &&
    (await verifyPassword(
      String(body.password || ""),
      user.password_salt,
      user.password_hash,
      user.password_iterations,
    ));
  if (!valid) {
    return json({ ok: false, error: "Invalid email or password." }, 401);
  }

  const lastLoginAt = nowIso();
  await requireDb(context.env)
    .prepare("UPDATE users SET last_login_at = ? WHERE id = ?")
    .bind(lastLoginAt, user.id)
    .run();
  await audit(context.env, user.id, "auth.login", {});

  const session = await createSession(context, user.id);
  return json(
    {
      ok: true,
      csrf_token: session.csrf,
      user: publicUser({ ...user, last_login_at: lastLoginAt }),
    },
    200,
    { "set-cookie": session.cookie },
  );
}
