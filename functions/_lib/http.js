export const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...extraHeaders,
    },
  });
}

export function methodNotAllowed(allowed) {
  return json(
    { ok: false, error: `Method not allowed. Use ${allowed.join(", ")}.` },
    405,
    { allow: allowed.join(", ") },
  );
}

export async function readJson(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Request body must be JSON.");
  }
  return request.json();
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function nowIso() {
  return new Date().toISOString();
}

export function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000);
}

export function requestOrigin(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function isSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) {
    return true;
  }
  return origin === requestOrigin(request);
}

export function maskAccountId(accountId) {
  const raw = String(accountId || "").trim();
  if (!raw) {
    return "";
  }
  if (raw.length <= 4) {
    return raw;
  }
  return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
}

export function clientIpHashInput(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for") ||
    "unknown"
  );
}
