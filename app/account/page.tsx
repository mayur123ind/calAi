"use client";

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Fridge, Gym, Key, LogOut, NavArrowRight, Page, Settings, Shield, StatsReport } from "iconoir-react";
import { signOut } from "@/components/AppShell";
import { AiAccess, Card, PrefsForm } from "./Settings";
import { Notice, PageHeader, Spinner, btn, input } from "@/components/ui";

type Me = { id: number; username: string; role: "user" | "admin" };

export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe);
  }, []);

  return (
    <div className="stagger mx-auto max-w-2xl px-4 sm:px-6 lg:px-10">
      <PageHeader title="Account" sub="Your settings, reminders and sign-in." />

      <div className="space-y-6">
        <section className="flex items-center gap-4 card p-4 shadow-md sm:p-5">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-leaf-soft font-display text-2xl font-semibold uppercase text-leaf">
            {me?.username.slice(0, 1) ?? ""}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl font-semibold">{me?.username ?? "…"}</p>
            <p className="text-sm capitalize text-muted">{me ? `${me.role} account` : ""}</p>
          </div>
          <button type="button" onClick={signOut} className={btn.secondary}>
            <LogOut className="size-5" /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </section>

        <ul className="divide-y divide-line overflow-hidden card shadow-sm">
          <LinkRow href="/history" icon={<StatsReport className="size-5" />} title="History & insights" sub="Calendar, streaks and your AI weekly review" />
          <LinkRow href="/workouts" icon={<Gym className="size-5" />} title="Workouts" sub="Plan, log sets and see calories burned" />
          <LinkRow href="/plan" icon={<Fridge className="size-5" />} title="Meal prep" sub="Plan meals, grams and recipes from your kitchen" />
          <LinkRow href="/goals" icon={<Settings className="size-5" />} title="Goals & targets" sub="Calories and macros worked out for you" />
          <LinkRow href="/report" icon={<Page className="size-5" />} title="Reports & export" sub="Print a PDF summary or download CSV" />
          {me?.role === "admin" && (
            <LinkRow href="/admin" icon={<Shield className="size-5" />} title="Admin" sub="Manage who can use CalAi" />
          )}
        </ul>

        <PrefsForm />
        <AiAccess />
        <PasswordForm />
      </div>
    </div>
  );
}

function LinkRow({ href, icon, title, sub }: { href: string; icon: ReactNode; title: string; sub: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2/60">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-leaf-soft text-leaf">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">{title}</span>
          <span className="block text-sm text-muted">{sub}</span>
        </span>
        <NavArrowRight className="size-4 shrink-0 text-muted" />
      </Link>
    </li>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const ids = { c: useId(), n: useId(), r: useId() };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setError("The new passwords don't match.");
      return;
    }
    setError(null);
    setStatus("saving");
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current, next }),
    }).catch(() => null);
    if (res?.ok) {
      setStatus("saved");
      setCurrent("");
      setNext("");
      setConfirm("");
    } else {
      setStatus("idle");
      setError((await res?.json().catch(() => null))?.error ?? "Couldn't change your password.");
    }
  }

  return (
    <Card icon={<Key className="size-5" />} title="Change password">
      <form onSubmit={onSubmit} className="space-y-3">
        <input type="text" autoComplete="username" hidden readOnly />
        <div>
          <label htmlFor={ids.c} className="mb-1.5 block text-sm font-medium">Current password</label>
          <input id={ids.c} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.n} className="mb-1.5 block text-sm font-medium">New password</label>
            <input id={ids.n} type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} className={input} />
          </div>
          <div>
            <label htmlFor={ids.r} className="mb-1.5 block text-sm font-medium">Repeat new password</label>
            <input id={ids.r} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
          </div>
        </div>
        <p className="text-xs text-muted">At least 8 characters. Other devices will be signed out.</p>
        {error && <Notice tone="error">{error}</Notice>}
        {status === "saved" && <Notice>Password changed.</Notice>}
        <button type="submit" disabled={status === "saving"} className={btn.secondary}>
          {status === "saving" ? <><Spinner /> Changing…</> : "Change password"}
        </button>
      </form>
    </Card>
  );
}
