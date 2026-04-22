import { api, getSession, nextPath } from "./api";

const form = document.querySelector<HTMLFormElement>("#auth-form");
const statusEl = document.querySelector<HTMLElement>("#auth-status");
const emailEl = document.querySelector<HTMLInputElement>("#email");
const passwordEl = document.querySelector<HTMLInputElement>("#password");
const displayNameEl = document.querySelector<HTMLInputElement>("#display-name");

function setStatus(message: string, tone: "error" | "success" | "" = "") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", tone === "error");
  statusEl.classList.toggle("success", tone === "success");
}

async function boot() {
  const session = await getSession().catch(() => ({ authenticated: false }));
  if (session.authenticated) {
    window.location.assign(nextPath("/game"));
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const mode = form.dataset.mode === "register" ? "register" : "login";
  const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
  setStatus(mode === "register" ? "Creating your trainer..." : "Opening the trainer gate...");

  try {
    await api(endpoint, {
      method: "POST",
      body: JSON.stringify({
        email: emailEl?.value || "",
        password: passwordEl?.value || "",
        display_name: displayNameEl?.value || "",
      }),
    });
    setStatus("Success. Entering the arena...", "success");
    window.location.assign(nextPath("/game"));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
});

boot();
