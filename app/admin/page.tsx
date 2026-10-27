"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Key, Prohibition, Shield, Trash, User } from "iconoir-react";
import { Notice, PageHeader, Spinner, btn, input } from "@/components/ui";
import { shortDate } from "@/lib/dates";
import { fmt } from "@/lib/nutrition";

type UserRow = {
  id: number;
  username: string;
  role: "user" | "admin";
  disabled: boolean;
  created_at: string;
  last_seen_at: string | null;
  meals: number;
  last_meal_day: string | null;
};

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
};

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [me, setMe] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [weekAgo, setWeekAgo] = useState(0);

  useEffect(() => {
    fetch("/api/admin/users", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 403) return setDenied(true);
        if (!r.ok) throw new Error();
        const d = await r.json();
        setWeekAgo(Date.now() - 7 * 86_400_000);
        setUsers(d.users);
        setMe(d.me);
      })
      .catch(() => setError("Couldn't load users. Refresh to try again."));
  }, []);

  async function act(id: number, method: "PATCH" | "DELETE", body?: object) {
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) {
      setError(data?.error ?? "That didn't work. Try again.");
      return false;
    }
    setUsers(data.users);
    return true;
  }

  if (denied) {
    return (
      <div className="stagger mx-auto max-w-3xl px-4 sm:px-6 lg:px-10">
        <PageHeader title="Admin" />
        <Notice tone="error">Only admins can open this page.</Notice>
      </div>
    );
  }

  const active = users?.filter((u) => u.last_seen_at && new Date(u.last_seen_at).getTime() > weekAgo).length ?? 0;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-10">
      <PageHeader title="Admin" sub="Everyone who can sign in to CalAi." />

      {error && <div className="mb-5"><Notice tone="error">{error}</Notice></div>}

      {!users ? (
        !error && <div className="h-72 animate-pulse rounded-3xl bg-surface-2" aria-hidden="true" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Accounts" value={fmt(users.length)} />
            <Stat label="Active this week" value={fmt(active)} />
            <Stat label="Meals logged" value={fmt(users.reduce((s, u) => s + u.meals, 0))} />
          </div>
          <ul className="space-y-3">
            {users.map((u) => (
              <UserCard key={u.id} user={u} isMe={u.id === me} act={act} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function UserCard({
  user: u,
  isMe,
  act,
}: {
  user: UserRow;
  isMe: boolean;
  act: (id: number, method: "PATCH" | "DELETE", body?: object) => Promise<boolean>;
}) {
  const [panel, setPanel] = useState<"none" | "password" | "delete">("none");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function run(method: "PATCH" | "DELETE", body?: object, message?: string) {
    setBusy(true);
    setDone(null);
    const ok = await act(u.id, method, body);
    setBusy(false);
    if (ok) {
      setPanel("none");
      setPassword("");
      if (message) setDone(message);
    }
  }

  function onReset(e: FormEvent) {
    e.preventDefault();
    run("PATCH", { password }, `Password reset. Share it with ${u.username} privately.`);
  }

  return (
    <li className={`card p-4 shadow-sm ${u.disabled ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-leaf-soft font-semibold uppercase text-leaf">
          {u.username.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
            <span className="truncate">{u.username}</span>
            {isMe && <span className="text-xs font-normal text-muted">(you)</span>}
            {u.role === "admin" && <Badge className="bg-leaf-soft text-leaf">Admin</Badge>}
            {u.disabled && <Badge className="bg-danger-soft text-danger">Turned off</Badge>}
          </p>
          <p className="num text-sm text-muted">
            {fmt(u.meals)} meals{u.last_meal_day ? ` · last ${shortDate(u.last_meal_day)}` : ""} · seen {ago(u.last_seen_at)} · joined{" "}
            {shortDate(u.created_at.slice(0, 10))}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-3">
        <button type="button" className={btn.ghost} onClick={() => setPanel(panel === "password" ? "none" : "password")}>
          <Key className="size-4" /> Reset password
        </button>
        {!isMe && (
          <>
            <button
              type="button"
              className={btn.ghost}
              disabled={busy}
              onClick={() => run("PATCH", { role: u.role === "admin" ? "user" : "admin" })}
            >
              {u.role === "admin" ? <User className="size-4" /> : <Shield className="size-4" />}
              {u.role === "admin" ? "Make regular user" : "Make admin"}
            </button>
            <button type="button" className={btn.ghost} disabled={busy} onClick={() => run("PATCH", { disabled: !u.disabled })}>
              <Prohibition className="size-4" /> {u.disabled ? "Turn on" : "Turn off"}
            </button>
            <button type="button" className={`${btn.ghost} hover:text-danger`} onClick={() => setPanel(panel === "delete" ? "none" : "delete")}>
              <Trash className="size-4" /> Delete
            </button>
          </>
        )}
      </div>

      {panel === "password" && (
        <form onSubmit={onReset} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            autoComplete="off"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password, 8+ characters"
            aria-label={`New password for ${u.username}`}
            className={input}
          />
          <button type="submit" disabled={busy} className={`${btn.primary} h-11 shrink-0`}>
            {busy ? <Spinner /> : "Set password"}
          </button>
        </form>
      )}

      {panel === "delete" && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger sm:flex-row sm:items-center">
          <p className="flex-1">Delete {u.username} and all their meals, weights and photos? This can&apos;t be undone.</p>
          <div className="flex gap-2">
            <button type="button" className={btn.ghost} onClick={() => setPanel("none")}>Cancel</button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run("DELETE")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:text-paper"
            >
              <Trash className="size-4" /> {busy ? "Deleting…" : "Delete account"}
            </button>
          </div>
        </div>
      )}

      {done && <p className="mt-2 text-sm text-leaf">{done}</p>}
    </li>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3.5 shadow-sm sm:p-4">
      <p className="text-xs text-muted sm:text-sm">{label}</p>
      <p className="num mt-1 font-display text-xl font-semibold leading-tight sm:text-2xl">{value}</p>
    </div>
  );
}
