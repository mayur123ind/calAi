"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useId, useState, type CSSProperties, type FormEvent } from "react";
import { Eye, EyeClosed } from "iconoir-react";
import { Logo } from "./Logo";
import { MaskedText, Notice, Spinner, btn, input } from "./ui";

/** Only same-site paths, so ?next= can't bounce people to another website. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const signup = mode === "signup";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { user: useId(), pass: useId(), confirm: useId() };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (signup && password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(signup ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Something went wrong. Try again.");
      // Full load so the app shell picks up the new session.
      window.location.assign(signup ? "/goals" : next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden lg:flex-row">
      <AuthHero />

      <div className="relative z-10 flex flex-1 items-start justify-center px-4 pb-12 pt-2 lg:items-center lg:px-10 lg:py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 animate-rise [animation-delay:350ms]">
          <p className="eyebrow">{signup ? "New here" : "Welcome back"}</p>
          <h2 className="mt-1 font-display text-[32px] font-bold leading-tight tracking-[-0.04em]">
            {signup ? "Create your account" : "Sign in"}
          </h2>
          <p className="mt-1 text-[15px] text-muted">
            {signup ? "Your meals and goals stay private to you." : "Pick up where you left off."}
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="card animate-rise space-y-4 p-5 shadow-md [animation-delay:450ms] sm:p-6"
        >
          <div>
            <label htmlFor={ids.user} className="mb-1.5 block text-sm font-medium">Username</label>
            <input
              id={ids.user}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              minLength={signup ? 3 : 1}
              maxLength={32}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={input}
            />
            {signup && <p className="mt-1.5 text-xs text-muted">3–32 letters, numbers, dots, dashes or underscores.</p>}
          </div>

          <div>
            <label htmlFor={ids.pass} className="mb-1.5 block text-sm font-medium">Password</label>
            <div className="relative">
              <input
                id={ids.pass}
                type={show ? "text" : "password"}
                autoComplete={signup ? "new-password" : "current-password"}
                required
                minLength={signup ? 8 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${input} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-ink"
              >
                {show ? <EyeClosed className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
            {signup && <p className="mt-1.5 text-xs text-muted">At least 8 characters.</p>}
          </div>

          {signup && (
            <div>
              <label htmlFor={ids.confirm} className="mb-1.5 block text-sm font-medium">Confirm password</label>
              <input
                id={ids.confirm}
                type={show ? "text" : "password"}
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={input}
              />
            </div>
          )}

          {error && <Notice tone="error">{error}</Notice>}

          <button type="submit" disabled={busy} className={`${btn.primary} w-full`}>
            {busy ? <><Spinner /> {signup ? "Creating account…" : "Signing in…"}</> : signup ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-[15px] text-muted">
          {signup ? "Already have an account? " : "New to CalAi? "}
          <Link
            href={signup ? `/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}` : "/signup"}
            className="font-semibold text-leaf underline-offset-2 hover:underline"
          >
            {signup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </div>
      </div>
    </div>
  );
}

const DISHES = ["Dal tadka", "Masala dosa", "Paneer tikka", "Poha", "Rajma chawal", "Idli sambar", "Chole", "Aloo paratha", "Biryani", "Upma"];

const CHIPS = [
  { name: "Dal tadka", kcal: 180, color: "var(--carbs)", className: "left-[4%] top-[18%]", delay: "0s" },
  { name: "2 rotis", kcal: 240, color: "var(--leaf)", className: "right-[2%] top-[34%]", delay: "-2.4s" },
  { name: "Paneer tikka", kcal: 265, color: "var(--protein)", className: "bottom-[14%] left-[10%]", delay: "-4.1s" },
];

/** Left panel on desktop, top band on phones: kinetic headline, a live plate and a food ticker. */
function AuthHero() {
  return (
    <section className="relative lg:m-3 lg:flex lg:w-[52%] lg:flex-col lg:overflow-hidden lg:rounded-[40px] lg:night">
      <div className="relative z-10 flex items-center gap-2.5 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] lg:px-10 lg:pt-10">
        <Logo className="size-10" />
        <span className="font-display text-2xl font-bold tracking-[-0.04em]">
          Cal<span className="text-leaf">Ai</span>
        </span>
      </div>

      <div className="relative z-10 px-5 pb-6 pt-8 lg:mt-auto lg:px-10 lg:pb-0">
        <h1 className="font-display text-[52px] font-extrabold leading-[0.92] tracking-[-0.035em] [font-stretch:92%] sm:text-7xl lg:text-[96px]">
          <span className="block">
            <MaskedText>Snap your</MaskedText>
          </span>
          <span className="block">
            <MaskedText delay={2}>plate.</MaskedText>{" "}
            <span className="mask-line">
              <span style={{ "--i": 3 } as CSSProperties} className="bg-gradient-to-r from-leaf to-carbs bg-clip-text pr-[0.06em] italic text-transparent">
                Done.
              </span>
            </span>
          </span>
        </h1>
        <p className="mt-4 max-w-sm animate-rise text-[15px] text-muted [animation-delay:500ms] lg:text-lg">
          AI that reads your thali — dal, roti, sabzi — and counts every calorie and macro for you.
        </p>
      </div>

      {/* The live plate: a slow dial with three macro arcs, and dishes floating around it. */}
      <div aria-hidden="true" className="relative mx-auto hidden aspect-square w-[min(80%,440px)] lg:my-6 lg:block">
        <svg viewBox="-120 -120 240 240" className="size-full">
          <circle r="116" fill="none" stroke="var(--line)" strokeWidth="1" strokeDasharray="2 6" className="origin-center animate-[spin_60s_linear_infinite] [transform-box:fill-box]" />
          <circle r="96" fill="var(--surface)" stroke="var(--line)" />
          {[
            { r: 84, color: "var(--leaf)", v: 0.72, d: "0.2s" },
            { r: 68, color: "var(--protein)", v: 0.55, d: "0.4s" },
            { r: 52, color: "var(--carbs)", v: 0.83, d: "0.6s" },
            { r: 36, color: "var(--fat)", v: 0.4, d: "0.8s" },
          ].map(({ r, color, v, d }) => {
            const c = 2 * Math.PI * r;
            return (
              <g key={r}>
                <circle r={r} fill="none" stroke="var(--surface-2)" strokeWidth="9" />
                <circle
                  r={r}
                  fill="none"
                  stroke={color}
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={`${c * v} ${c}`}
                  transform="rotate(-90)"
                  style={{ filter: `drop-shadow(0 0 5px ${color})`, animation: `arc-draw 1.8s var(--ease-out) ${d} backwards`, "--c": c } as CSSProperties}
                />
              </g>
            );
          })}
        </svg>
        {CHIPS.map((chip) => (
          <span
            key={chip.name}
            className={`float absolute flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3.5 py-2 text-sm font-semibold shadow-md backdrop-blur ${chip.className}`}
            style={{ animationDelay: chip.delay }}
          >
            <span className="size-2.5 rounded-full" style={{ background: chip.color, boxShadow: `0 0 10px ${chip.color}` }} />
            {chip.name}
            <span className="num font-normal text-muted">{chip.kcal} kcal</span>
          </span>
        ))}
      </div>

      {/* Ticker of dishes it knows. */}
      <div aria-hidden="true" className="relative overflow-hidden border-y border-line/70 py-3 lg:mt-auto lg:border-b-0">
        <div className="marquee flex w-max gap-8 whitespace-nowrap font-display text-lg font-semibold tracking-tight text-muted">
          {[...DISHES, ...DISHES].map((d, i) => (
            <span key={i} className="flex items-center gap-8">
              {d}
              <span className="size-1.5 rounded-full bg-leaf" />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
