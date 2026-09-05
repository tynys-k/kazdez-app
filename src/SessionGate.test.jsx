// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SessionGate from "./SessionGate";
import { supabase } from "./supabaseClient";

vi.mock("./supabaseClient", () => ({ supabase: {
  auth: { getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() }, from: vi.fn(),
} }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const session = (id) => ({ user: { id } });
const profile = (id, extra = {}) => ({ id, role: "tech", is_active: true, ...extra });
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
let container, root, authEvent, single, unsubscribe;
beforeEach(() => {
  vi.resetAllMocks();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  unsubscribe = vi.fn();
  supabase.auth.onAuthStateChange.mockImplementation((callback) => { authEvent = callback; return { data: { subscription: { unsubscribe } } }; });
  supabase.auth.getSession.mockResolvedValue({ data: { session: session("a") } });
  single = vi.fn().mockResolvedValue({ data: profile("a") });
  const query = { select: vi.fn(() => query), eq: vi.fn(() => query), single };
  supabase.from.mockReturnValue(query);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render() {
  await act(async () => root.render(<SessionGate login={<p>LOGIN</p>}>{(s, p) => <p>PRIVATE:{s.user.id}:{p.role}</p>}</SessionGate>));
}
async function click(text) { await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent === text).click()); }

describe("profile-gated startup", () => {
  it("does not mount private content before the profile arrives", async () => {
    const pending = deferred(); single.mockReturnValue(pending.promise);
    await render();
    expect(container.textContent).toContain("Проверяем доступ");
    expect(container.textContent).not.toContain("PRIVATE");
    await act(async () => pending.resolve({ data: profile("a", { role: "admin" }) }));
    expect(container.textContent).toBe("PRIVATE:a:admin");
  });
  it.each([{ data: null }, { error: { message: "offline" } }, { data: profile("a", { role: "unknown" }) }])("fails closed for an unavailable or invalid profile: %j", async (result) => {
    single.mockResolvedValueOnce(result);
    await render();
    expect(container.textContent).toContain("Не удалось проверить доступ");
    expect(container.textContent).not.toContain("PRIVATE");
    await click("Повторить");
    expect(container.textContent).toBe("PRIVATE:a:tech");
  });
  it("handles a thrown request and permits retry", async () => {
    single.mockRejectedValueOnce(new Error("offline"));
    await render();
    expect(container.textContent).toContain("Не удалось проверить доступ");
    await click("Повторить");
    expect(container.textContent).toContain("PRIVATE:a");
  });
  it("blocks disabled employees", async () => {
    single.mockResolvedValueOnce({ data: profile("a", { is_active: false }) });
    await render();
    expect(container.textContent).toContain("Доступ отключён");
    expect(container.textContent).not.toContain("PRIVATE");
  });
  it("ignores a late getSession result after a logout event", async () => {
    const pending = deferred(); supabase.auth.getSession.mockReturnValue(pending.promise);
    await render();
    await act(async () => authEvent("SIGNED_OUT", null));
    await act(async () => pending.resolve({ data: { session: session("a") } }));
    expect(container.textContent).toBe("LOGIN");
    expect(single).not.toHaveBeenCalled();
  });
  it("cannot apply the previous user's late profile to a new session", async () => {
    const first = deferred(), second = deferred();
    single.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await render();
    await act(async () => authEvent("SIGNED_IN", session("b")));
    await act(async () => first.resolve({ data: profile("a", { role: "admin" }) }));
    expect(container.textContent).not.toContain("PRIVATE");
    await act(async () => second.resolve({ data: profile("b") }));
    expect(container.textContent).toBe("PRIVATE:b:tech");
  });
  it("handles a session lookup rejection without getting stuck on loading", async () => {
    supabase.auth.getSession.mockRejectedValueOnce(new Error("network"));
    await render();
    expect(container.textContent).toContain("Не удалось проверить доступ");
    await click("Повторить");
    expect(container.textContent).toBe("PRIVATE:a:tech");
  });
});
