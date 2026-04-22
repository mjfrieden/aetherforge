import { utf8, bytesToBase64Url, timingSafeEqual } from "./encoding.js";
import { json, isSameOrigin } from "./http.js";

const PBKDF2_ITERATIONS = 100000;

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    utf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function hmac(secret, value) {
  const key = await importHmacKey(secret);
  const signed = await crypto.subtle.sign("HMAC", key, utf8(value));
  return bytesToBase64Url(new Uint8Array(signed));
}

export function getAuthSecret(env) {
  const secret = String(env.AUTH_SECRET || "").trim();
  if (secret.length < 32) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters.");
  }
  return secret;
}

export async function hashOpaqueValue(env, value, purpose = "session") {
  return hmac(getAuthSecret(env), `${purpose}:${value}`);
}

export async function hashPassword(password, salt, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: utf8(salt),
      iterations,
    },
    key,
    256,
  );
  return {
    hash: bytesToBase64Url(new Uint8Array(bits)),
    iterations,
  };
}

export async function verifyPassword(password, salt, expectedHash, iterations) {
  const actual = await hashPassword(password, salt, Number(iterations || PBKDF2_ITERATIONS));
  return timingSafeEqual(actual.hash, String(expectedHash || ""));
}

export function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 12) {
    return "Use a password with at least 12 characters.";
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Use upper-case, lower-case, and number characters.";
  }
  return null;
}

export function validateDisplayName(value) {
  const name = String(value || "").trim();
  if (name.length < 2 || name.length > 40) {
    return "Display name must be 2 to 40 characters.";
  }
  if (!/^[A-Za-z0-9 ._-]+$/.test(name)) {
    return "Display name can use letters, numbers, spaces, dots, underscores, and hyphens.";
  }
  return null;
}

export function validateEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email address.";
  }
  return null;
}

export async function requireSameOriginAndCsrf(context, session) {
  if (!isSameOrigin(context.request)) {
    return json({ ok: false, error: "Cross-origin state changes are blocked." }, 403);
  }
  const provided = context.request.headers.get("x-csrf-token") || "";
  if (!session?.csrf_token || !timingSafeEqual(provided, session.csrf_token)) {
    return json({ ok: false, error: "Missing or invalid CSRF token." }, 403);
  }
  return null;
}
