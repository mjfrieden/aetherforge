import { base64UrlToBytes, bytesToBase64Url, decodeUtf8, utf8 } from "./encoding.js";

function keyBytesFromEnv(env) {
  const raw = String(env.TOKEN_ENCRYPTION_KEY || "").trim();
  if (!raw) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not configured.");
  }
  const normalized = raw.includes("+") || raw.includes("/") ? raw : raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (bytes.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return bytes;
}

async function importAesKey(env) {
  return crypto.subtle.importKey("raw", keyBytesFromEnv(env), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSecret(env, plaintext, aad) {
  const key = await importAesKey(env);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: utf8(aad),
    },
    key,
    utf8(plaintext),
  );
  return {
    encrypted: bytesToBase64Url(new Uint8Array(encrypted)),
    iv: bytesToBase64Url(iv),
  };
}

export async function decryptSecret(env, encrypted, iv, aad) {
  const key = await importAesKey(env);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlToBytes(iv),
      additionalData: utf8(aad),
    },
    key,
    base64UrlToBytes(encrypted),
  );
  return decodeUtf8(new Uint8Array(decrypted));
}
