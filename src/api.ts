import type { AppData, User } from "../shared/types";

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method, credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: any = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(json.error ?? "Error de red"), { status: r.status });
  return json as T;
}

export const api = {
  config: () => call<{ googleClientId: string; devAuth: boolean }>("GET", "/api/config"),
  me: () => call<User>("GET", "/api/me"),
  loginGoogle: (credential: string) => call<User>("POST", "/api/auth/google", { credential }),
  loginDev: (email: string) => call<User>("POST", "/api/auth/dev", { email }),
  logout: () => call("POST", "/api/auth/logout"),
  data: () => call<AppData>("GET", "/api/data"),
  saveExpense: (id: number | null, e: unknown) =>
    id ? call("PUT", `/api/expenses/${id}`, e) : call("POST", "/api/expenses", e),
  deleteExpense: (id: number) => call("DELETE", `/api/expenses/${id}`),
  dismissPending: (id: number) => call("POST", `/api/pending/${id}/dismiss`),
  addSettlement: (s: unknown) => call("POST", "/api/settlements", s),
  deleteSettlement: (id: number) => call("DELETE", `/api/settlements/${id}`),
  addCategory: (name: string, emoji: string) => call("POST", "/api/categories", { name, emoji }),
  deleteCategory: (id: number) => call("DELETE", `/api/categories/${id}`),
};
