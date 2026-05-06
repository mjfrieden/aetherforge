import { loadTradierAccount } from "./tradier.js";

export const RESEARCH_WORKSPACE_DEMO = "demo";
export const RESEARCH_WORKSPACE_LIVE = "live";

export function normalizeResearchWorkspace(value, fallback = RESEARCH_WORKSPACE_DEMO) {
  return value === RESEARCH_WORKSPACE_LIVE ? RESEARCH_WORKSPACE_LIVE : fallback;
}

export function researchWorkspaceFromAccount(account) {
  return account ? RESEARCH_WORKSPACE_LIVE : RESEARCH_WORKSPACE_DEMO;
}

export async function resolveResearchWorkspace(env, userId) {
  const account = await loadTradierAccount(env, userId);
  return researchWorkspaceFromAccount(account);
}

export function isDemoWorkspace(workspace) {
  return normalizeResearchWorkspace(workspace) === RESEARCH_WORKSPACE_DEMO;
}

export function isLiveWorkspace(workspace) {
  return normalizeResearchWorkspace(workspace) === RESEARCH_WORKSPACE_LIVE;
}
