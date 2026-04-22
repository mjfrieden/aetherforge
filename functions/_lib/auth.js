import { randomBase64Url } from "./encoding.js";
import { audit, getUserById, requireDb } from "./db.js";
import { addSeconds, clientIpHashInput, json, nowIso } from "./http.js";
import { hashOpaqueValue } from "./security.js";

export const SESSION_COOKIE = "aetherforge_session";

function parseCookies(header) {
  const values = {};
  if (!header) {
    return values;
  }
  for (const chunk of header.split(";")) {
    const [rawName, ...rest] = chunk.trim().split("=");
    if (rawName) {
      values[rawName] = rest.join("=");
    }
  }
  return values;
}

function cookieSecureAttribute(request, env) {
  if (String(env.COOKIE_SECURE || "").toLowerCase() === "false") {
    return "";
  }
  return new URL(request.url).protocol === "https:" ? "; Secure" : "";
}

function sessionTtl(env) {
  const parsed = Number.parseInt(String(env.SESSION_TTL_SECONDS || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 60 * 60 * 24 * 7) : 60 * 60 * 12;
}

export function clearSessionCookie(request, env) {
  return `${SESSION_COOKIE}=deleted; Path=/; HttpOnly; SameSite=Lax${cookieSecureAttribute(
    request,
    env,
  )}; Max-Age=0`;
}

export async function createSession(context, userId) {
  const token = randomBase64Url(32);
  const csrf = randomBase64Url(24);
  const idHash = await hashOpaqueValue(context.env, token, "session");
  const ipHash = await hashOpaqueValue(context.env, clientIpHashInput(context.request), "ip");
  const now = new Date();
  const expiresAt = addSeconds(now, sessionTtl(context.env)).toISOString();

  await requireDb(context.env)
    .prepare(
      "INSERT INTO sessions (id_hash, user_id, csrf_token, created_at, expires_at, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      idHash,
      userId,
      csrf,
      now.toISOString(),
      expiresAt,
      String(context.request.headers.get("user-agent") || "").slice(0, 240),
      ipHash,
    )
    .run();

  await audit(context.env, userId, "auth.session_created", {});

  return {
    token,
    csrf,
    cookie: `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${cookieSecureAttribute(
      context.request,
      context.env,
    )}; Max-Age=${sessionTtl(context.env)}`,
  };
}

export async function readSession(request, env) {
  const token = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE];
  if (!token) {
    return null;
  }
  const idHash = await hashOpaqueValue(env, token, "session");
  const row = await requireDb(env)
    .prepare("SELECT * FROM sessions WHERE id_hash = ?")
    .bind(idHash)
    .first();
  if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
    return null;
  }
  const user = await getUserById(env, row.user_id);
  if (!user) {
    return null;
  }
  return {
    ...row,
    user,
  };
}

export async function destroySession(context) {
  const token = parseCookies(context.request.headers.get("Cookie"))[SESSION_COOKIE];
  if (token) {
    const idHash = await hashOpaqueValue(context.env, token, "session");
    await requireDb(context.env).prepare("DELETE FROM sessions WHERE id_hash = ?").bind(idHash).run();
  }
  return json(
    { ok: true },
    200,
    {
      "set-cookie": clearSessionCookie(context.request, context.env),
    },
  );
}

export async function requireSession(context) {
  const session = await readSession(context.request, context.env);
  if (!session) {
    return {
      response: json({ ok: false, error: "Authentication required." }, 401),
      session: null,
    };
  }
  return { response: null, session };
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    created_at: user.created_at,
    last_login_at: user.last_login_at,
  };
}

export async function pruneExpiredSessions(env) {
  await requireDb(env).prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(nowIso()).run();
}
