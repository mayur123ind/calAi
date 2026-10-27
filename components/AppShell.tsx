"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, ViewTransition } from "react";
import { ChatBubble, Cutlery, GraphUp, Gym, HomeSimple, LogOut, Plus, Settings, Shield, StatsReport, User } from "iconoir-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { Logo } from "./Logo";
import { PREFS_EVENT, ReminderWatcher } from "./Reminders";
import { applyTheme } from "@/lib/theme";

type NavItem = { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; also?: string[] };
type Me = { id: number; username: string; role: "user" | "admin" };

const NAV: NavItem[] = [
  { href: "/", label: "Today", icon: HomeSimple },
  { href: "/progress", label: "Progress", icon: GraphUp, also: ["/weight"] },
  { href: "/coach", label: "Coach", icon: ChatBubble },
  { href: "/workouts", label: "Workouts", icon: Gym },
  { href: "/plan", label: "Meal prep", icon: Cutlery },
  { href: "/history", label: "History", icon: StatsReport, also: ["/report"] },
  { href: "/goals", label: "Goals", icon: Settings },
  { href: "/account", label: "Account", icon: User },
];

// Phones get five tabs around the add button; Meal prep is on Today, History on Progress, Goals and Admin on Me.
const byHref = (href: string) => NAV.find((n) => n.href === href)!;
const TABS: NavItem[] = [
  { ...byHref("/"), also: ["/plan"] },
  { ...byHref("/progress"), also: ["/weight", "/history", "/report"] },
  byHref("/coach"),
  { ...byHref("/workouts"), label: "Train" },
  { ...byHref("/account"), label: "Me", also: ["/goals", "/admin"] },
];

const AUTH_PAGES = ["/login", "/signup"];

function isActive(pathname: string, item: NavItem) {
  return [item.href, ...(item.also ?? [])].some((h) => (h === "/" ? pathname === "/" : pathname.startsWith(h)));
}

export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" });
  // Full reload, so nothing from the old session stays in memory.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/login";
}

/** The active-nav highlight. Sharing one name lets it morph from the old tab to the new one. */
function NavPill({ name, className }: { name: string; className: string }) {
  return (
    <ViewTransition name={name} share="nav-pill" default="none">
      <span aria-hidden="true" className={`absolute ${className}`} />
    </ViewTransition>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const authPage = AUTH_PAGES.includes(pathname);
  const onAdd = pathname.startsWith("/add");
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (authPage) return;
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" }).then(async (res) => {
      if (!alive) return;
      if (res.status === 401) router.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      else if (res.ok) setMe(await res.json());
    });
    return () => {
      alive = false;
    };
  }, [authPage, router]);

  // The theme is saved with the account; apply it here (and whenever settings change) so every device follows it.
  useEffect(() => {
    if (!me) return;
    const load = () =>
      fetch("/api/prefs", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((p) => p?.theme && applyTheme(p.theme))
        .catch(() => {});
    void load();
    window.addEventListener(PREFS_EVENT, load);
    return () => window.removeEventListener(PREFS_EVENT, load);
  }, [me]);

  if (authPage)
    return (
      <main>
        <ViewTransition default="page">{children}</ViewTransition>
      </main>
    );

  const nav = me?.role === "admin" ? [...NAV, { href: "/admin", label: "Admin", icon: Shield }] : NAV;

  return (
    <div className="lg:flex">
      {me && <ReminderWatcher />}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 p-3 lg:block print:hidden">
        <div className="card flex h-full flex-col px-4 py-6 shadow-md">
          <Link href="/" className="group mb-8 flex items-center gap-2.5 px-2" aria-label="CalAi home">
            <Logo className="size-9 transition-transform duration-500 ease-spring group-hover:-rotate-12 group-hover:scale-110" />
            <span className="font-display text-2xl font-bold tracking-[-0.04em]">
              Cal<span className="text-leaf">Ai</span>
            </span>
          </Link>
          <Link
            href="/add"
            className="group relative mb-6 flex h-12 items-center justify-center gap-2 overflow-hidden rounded-full bg-[#0b1a12] font-semibold text-white shadow-md transition-transform duration-300 hover:-translate-y-0.5 active:scale-[0.97] dark:bg-lime dark:text-[#06120c]"
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(60%_120%_at_50%_130%,#a3e635,transparent_70%)] opacity-50 transition-opacity duration-500 group-hover:opacity-90 dark:bg-[radial-gradient(60%_120%_at_50%_130%,#ffffff,transparent_70%)]"
            />
            <Plus className="relative size-5 transition-transform duration-500 ease-spring group-hover:rotate-90" strokeWidth={2.2} />
            <span className="relative">Log a meal</span>
          </Link>
          <nav className="flex flex-col gap-1" aria-label="Main">
            {nav.map((item) => {
              const { href, label, icon: Icon } = item;
              const active = isActive(pathname, item);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex h-11 items-center gap-3 rounded-full px-4 text-[15px] transition-colors duration-300 ${
                    active ? "font-semibold text-on-leaf" : "text-muted hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  {active && <NavPill name="side-pill" className="inset-0 rounded-full bg-leaf shadow-glow" />}
                  <Icon className="relative size-5 transition-transform duration-300 group-hover:scale-110" strokeWidth={1.8} />
                  <span className="relative">{label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto space-y-3">
            {me && (
              <div className="flex items-center gap-2.5 rounded-full border border-line/70 bg-surface-2/70 p-1.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-leaf to-lime text-sm font-bold uppercase text-on-leaf">
                  {me.username.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{me.username}</span>
                  <span className="block text-xs capitalize text-muted">{me.role}</span>
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  aria-label="Sign out"
                  title="Sign out"
                  className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
                >
                  <LogOut className="size-[18px]" />
                </button>
              </div>
            )}
            <p className="px-2 text-xs leading-relaxed text-muted">Estimates come from AI. Check portions before saving.</p>
          </div>
        </div>
      </aside>

      <main
        className={`min-w-0 flex-1 ${onAdd ? "pb-6" : "pb-[calc(7rem+env(safe-area-inset-bottom))]"} lg:pb-10 print:pb-0`}
      >
        <ViewTransition default="page">{children}</ViewTransition>
      </main>

      {/* Mobile tab bar: a floating glass dock */}
      {!onAdd && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden print:hidden"
        >
          <div className="mx-auto grid h-[68px] max-w-md grid-cols-6 items-center rounded-full border border-line/70 bg-surface/75 px-1 shadow-md backdrop-blur-xl backdrop-saturate-150">
            {TABS.slice(0, 2).map((item) => (
              <TabLink key={item.href} item={item} active={isActive(pathname, item)} />
            ))}
            <div className="flex justify-center">
              <Link
                href="/add"
                aria-label="Log a meal"
                className="group relative flex size-14 items-center justify-center rounded-full bg-[#0b1a12] text-lime shadow-[0_10px_30px_-6px_rgb(11_26_18/0.6)] transition-transform duration-300 ease-spring active:scale-90 dark:bg-lime dark:text-[#06120c] dark:shadow-glow"
              >
                <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-lime/25 [animation-duration:2.8s]" />
                <Plus className="relative size-7 transition-transform duration-500 ease-spring group-active:rotate-90" strokeWidth={2.4} />
              </Link>
            </div>
            {TABS.slice(2).map((item) => (
              <TabLink key={item.href} item={item} active={isActive(pathname, item)} />
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative mx-0.5 flex h-[54px] min-w-0 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors duration-300 ${
        active ? "text-leaf-strong" : "text-muted"
      }`}
    >
      {active && <NavPill name="tab-pill" className="inset-0 rounded-full bg-leaf-soft" />}
      <Icon
        className={`relative size-6 transition-transform duration-500 ease-spring ${active ? "-translate-y-px scale-110" : ""}`}
        strokeWidth={active ? 2 : 1.6}
      />
      <span className="relative">{item.label}</span>
    </Link>
  );
}
