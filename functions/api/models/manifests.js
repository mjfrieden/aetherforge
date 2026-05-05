import { requireSession } from "../../_lib/auth.js";
import { json, readJson } from "../../_lib/http.js";
import { ensureSystemFeatureManifests, importFeatureManifest, listFeatureManifests } from "../../_lib/model_forge.js";
import { requireSameOriginAndCsrf } from "../../_lib/security.js";

export async function onRequestGet(context) {
  const auth = await requireSession(context);
  if (auth.response) {
    return auth.response;
  }
  await ensureSystemFeatureManifests(context.env);
  return json({
    ok: true,
    manifests: await listFeatureManifests(context.env, auth.session.user.id),
  });
}

export async function onRequestPost(context) {
  const auth = await requireSession(context);
  if (auth.response) {
    return auth.response;
  }
  const csrf = await requireSameOriginAndCsrf(context, auth.session);
  if (csrf) {
    return csrf;
  }
  let body;
  try {
    body = await readJson(context.request);
  } catch (error) {
    return json({ ok: false, error: error.message }, 400);
  }
  await ensureSystemFeatureManifests(context.env);
  try {
    const manifest = await importFeatureManifest(context.env, auth.session.user.id, body.manifest_id);
    return json({ ok: true, manifest });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 404);
  }
}
