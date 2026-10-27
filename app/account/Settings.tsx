"use client";

import { useEffect, useId, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Bell, Calendar, Check, Droplet, Gym, HalfMoon, Key, Microphone, Sparks, Timer, Weight } from "iconoir-react";
import { PREFS_EVENT } from "@/components/Reminders";
import { Notice, Segmented, Spinner, btn, input } from "@/components/ui";
import {
  AI_PROVIDERS,
  KEY_PROVIDERS,
  SPEECH_PROVIDERS,
  languagesFor,
  providerInfo,
  type AiSettings,
  type KeyProviderId,
} from "@/lib/ai/catalog";
import { CARD_NUTRIENTS, type CardKey } from "@/lib/nutrients";
import { MEAL_TYPES, fmt, type Prefs } from "@/lib/nutrition";
import { applyTheme } from "@/lib/theme";

export function Card({ icon, title, id, children }: { icon: ReactNode; title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-6 p-4 shadow-md sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
        <span className="text-leaf">{icon}</span> {title}
      </h2>
      {children}
    </section>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-[15px]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--leaf)]" />
      <span>{children}</span>
    </label>
  );
}

function Labeled({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      {children(id)}
    </div>
  );
}

const noSubscribe = () => () => {};
const notificationPermission = (): NotificationPermission | "unsupported" =>
  typeof Notification === "undefined" || !window.isSecureContext ? "unsupported" : Notification.permission;

const WATER_GOALS = Array.from({ length: 23 }, (_, i) => 1000 + i * 250);
const GLASS_SIZES = [150, 200, 250, 300, 350, 500];

/** Everything saved in prefs: appearance, calendar, Home, water, fasting, body fat, training and reminders. */
export function PrefsForm() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<NotificationPermission | null>(null);
  const initial = useSyncExternalStore(noSubscribe, notificationPermission, () => "default" as const);
  const permission = asked ?? initial;

  useEffect(() => {
    fetch("/api/prefs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setPrefs)
      .catch(() => setError("Couldn't load your settings. Refresh to try again."));
  }, []);

  const set = (patch: (p: Prefs) => Prefs) => {
    setPrefs((p) => (p ? patch(p) : p));
    setStatus("idle");
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prefs) return;
    setStatus("saving");
    setError(null);
    const { adaptive, ...rest } = prefs;
    const res = await fetch("/api/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rest, adaptive: { enabled: adaptive.enabled } }),
    }).catch(() => null);
    if (res?.ok) {
      setStatus("saved");
      applyTheme(prefs.theme);
      window.dispatchEvent(new Event(PREFS_EVENT));
    } else {
      setStatus("idle");
      setError((await res?.json().catch(() => null))?.error ?? "Couldn't save your settings.");
    }
  }

  if (!prefs) {
    return error ? <Notice tone="error">{error}</Notice> : <div className="h-72 animate-pulse rounded-3xl bg-surface-2" aria-hidden="true" />;
  }

  const r = prefs.reminders;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card icon={<HalfMoon className="size-5" />} title="Appearance">
        <Segmented
          label="Theme"
          value={prefs.theme}
          onChange={(theme) => {
            set((p) => ({ ...p, theme }));
            applyTheme(theme); // preview straight away
          }}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </Card>

      <Card icon={<Calendar className="size-5" />} title="Calendar and Home">
        <div className="grid gap-4 sm:grid-cols-2">
          <Labeled label="Week starts on">
            {(id) => (
              <select id={id} value={prefs.weekStart} onChange={(e) => set((p) => ({ ...p, weekStart: Number(e.target.value) as Prefs["weekStart"] }))} className={input}>
                <option value={1}>Monday</option>
                <option value={0}>Sunday</option>
                <option value={6}>Saturday</option>
              </select>
            )}
          </Labeled>
          <Labeled label="Meals on Home">
            {(id) => (
              <select id={id} value={prefs.logSort} onChange={(e) => set((p) => ({ ...p, logSort: e.target.value as Prefs["logSort"] }))} className={input}>
                <option value="grouped">Grouped by meal</option>
                <option value="latest">Latest logged first</option>
              </select>
            )}
          </Labeled>
        </div>

        <p className="mb-2 mt-5 text-sm font-medium">Meal start times</p>
        <p className="mb-3 text-sm text-muted">New logs are put in the meal whose start time has passed.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {MEAL_TYPES.map((t) => (
            <Labeled key={t.id} label={t.label}>
              {(id) => (
                <input
                  id={id}
                  type="time"
                  required
                  value={prefs.mealTimes[t.id]}
                  onChange={(e) => set((p) => ({ ...p, mealTimes: { ...p.mealTimes, [t.id]: e.target.value } }))}
                  className={`${input} num`}
                />
              )}
            </Labeled>
          ))}
        </div>

        <p className="mb-2 mt-5 text-sm font-medium">Home nutrient cards</p>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <Labeled key={i} label={`Card ${i + 1}`}>
              {(id) => (
                <select
                  id={id}
                  value={prefs.homeCards[i]}
                  onChange={(e) =>
                    set((p) => {
                      const cards = [...p.homeCards];
                      cards[i] = e.target.value as CardKey;
                      return { ...p, homeCards: cards };
                    })
                  }
                  className={`${input} px-2 text-sm`}
                >
                  {CARD_NUTRIENTS.map((n) => (
                    <option key={n.key} value={n.key}>
                      {n.label}
                    </option>
                  ))}
                </select>
              )}
            </Labeled>
          ))}
        </div>
      </Card>

      <Card icon={<Droplet className="size-5" />} title="Water">
        <Toggle checked={prefs.water.enabled} onChange={(v) => set((p) => ({ ...p, water: { ...p.water, enabled: v } }))}>
          Track water
        </Toggle>
        {prefs.water.enabled && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Daily goal">
                {(id) => (
                  <select id={id} value={prefs.waterGoalMl} onChange={(e) => set((p) => ({ ...p, waterGoalMl: Number(e.target.value) }))} className={`${input} num`}>
                    {WATER_GOALS.map((ml) => (
                      <option key={ml} value={ml}>
                        {fmt(ml)} ml
                      </option>
                    ))}
                  </select>
                )}
              </Labeled>
              <Labeled label="One glass">
                {(id) => (
                  <select id={id} value={prefs.water.glassMl} onChange={(e) => set((p) => ({ ...p, water: { ...p.water, glassMl: Number(e.target.value) } }))} className={`${input} num`}>
                    {GLASS_SIZES.map((ml) => (
                      <option key={ml} value={ml}>
                        {ml} ml
                      </option>
                    ))}
                  </select>
                )}
              </Labeled>
            </div>
            <Toggle checked={prefs.water.reminder} onChange={(v) => set((p) => ({ ...p, water: { ...p.water, reminder: v } }))}>
              Remind me to drink, every{" "}
              <select
                aria-label="Hours between water reminders"
                value={prefs.water.reminderEveryHours}
                onChange={(e) => set((p) => ({ ...p, water: { ...p.water, reminderEveryHours: Number(e.target.value) } }))}
                className="rounded-lg border border-line bg-surface px-1.5 py-0.5"
              >
                {[1, 2, 3, 4].map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>{" "}
              hours (8 am to 9 pm), while I&apos;m behind on my goal
            </Toggle>
          </div>
        )}
      </Card>

      <Card icon={<Timer className="size-5" />} title="Fasting">
        <Toggle checked={prefs.fasting.enabled} onChange={(v) => set((p) => ({ ...p, fasting: { ...p.fasting, enabled: v } }))}>
          Track fasting
          <span className="block text-sm text-muted">Start and end fasts from the + menu on Home. Fasting never changes your nutrition totals.</span>
        </Toggle>
        {prefs.fasting.enabled && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:items-end">
            <Labeled label="Goal (hours)">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={1}
                  max={168}
                  value={prefs.fasting.goalHours}
                  onChange={(e) => set((p) => ({ ...p, fasting: { ...p.fasting, goalHours: Math.max(1, Math.min(168, Number(e.target.value) || 1)) } }))}
                  className={`${input} num`}
                />
              )}
            </Labeled>
            <Toggle checked={prefs.fasting.alert} onChange={(v) => set((p) => ({ ...p, fasting: { ...p.fasting, alert: v } }))}>
              Alert me when I reach the goal
            </Toggle>
          </div>
        )}
      </Card>

      <Card icon={<Weight className="size-5" />} title="Body">
        <Toggle checked={prefs.bodyFat} onChange={(v) => set((p) => ({ ...p, bodyFat: v }))}>
          Track body fat %
          <span className="block text-sm text-muted">Adds a body fat box next to weight on Progress, and a body fat chart.</span>
        </Toggle>
      </Card>

      <Card icon={<Gym className="size-5" />} title="Training">
        <div className="grid gap-4 sm:grid-cols-3">
          <Labeled label="Focus">
            {(id) => (
              <select id={id} value={prefs.training.focus} onChange={(e) => set((p) => ({ ...p, training: { ...p.training, focus: e.target.value as Prefs["training"]["focus"] } }))} className={input}>
                <option value="general">General fitness</option>
                <option value="strength">Strength</option>
                <option value="muscle">Muscle gain</option>
                <option value="endurance">Endurance</option>
              </select>
            )}
          </Labeled>
          <Labeled label="Days a week">
            {(id) => (
              <input
                id={id}
                type="number"
                min={0}
                max={7}
                value={prefs.training.daysPerWeek}
                onChange={(e) => set((p) => ({ ...p, training: { ...p.training, daysPerWeek: Math.max(0, Math.min(7, Number(e.target.value) || 0)) } }))}
                className={`${input} num`}
              />
            )}
          </Labeled>
          <Labeled label="Equipment">
            {(id) => (
              <input
                id={id}
                maxLength={200}
                value={prefs.training.equipment}
                onChange={(e) => set((p) => ({ ...p, training: { ...p.training, equipment: e.target.value } }))}
                placeholder="Home: dumbbells, bands"
                className={input}
              />
            )}
          </Labeled>
        </div>
        <p className="mt-2 text-sm text-muted">The Coach uses these when you ask about training.</p>
      </Card>

      <Card icon={<Bell className="size-5" />} title="Meal reminders">
        <Toggle checked={r.enabled} onChange={(v) => set((p) => ({ ...p, reminders: { ...p.reminders, enabled: v } }))}>
          Remind me when I haven&apos;t logged a meal
        </Toggle>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {(["breakfast", "lunch", "dinner"] as const).map((key) => (
            <Labeled key={key} label={key[0].toUpperCase() + key.slice(1)}>
              {(id) => (
                <input
                  id={id}
                  type="time"
                  required
                  value={r[key]}
                  disabled={!r.enabled}
                  onChange={(e) => set((p) => ({ ...p, reminders: { ...p.reminders, [key]: e.target.value } }))}
                  className={`${input} num disabled:opacity-50`}
                />
              )}
            </Labeled>
          ))}
        </div>
        <div className="mt-4 rounded-2xl bg-surface-2 p-3.5 text-sm leading-relaxed text-muted">
          <p>Reminders show on Today once their time passes; water and fasting alerts use the same notifications.</p>
          {permission === "granted" && <p className="mt-1">Notifications are on: CalAi alerts you while it&apos;s open in a tab or installed as an app.</p>}
          {permission === "default" && (
            <p className="mt-1">
              Want pop-up alerts too?{" "}
              <button type="button" onClick={async () => setAsked(await Notification.requestPermission())} className="font-semibold text-leaf underline-offset-2 hover:underline">
                Turn on notifications
              </button>
            </p>
          )}
          {permission === "denied" && <p className="mt-1">Notifications are blocked for this site. Allow them in your browser&apos;s site settings.</p>}
          {permission === "unsupported" && <p className="mt-1">Pop-up alerts need the app on https or on this PC (localhost).</p>}
        </div>
      </Card>

      {error && <Notice tone="error">{error}</Notice>}
      <div className="sticky bottom-[calc(6rem+env(safe-area-inset-bottom))] z-10 lg:bottom-4">
        <button type="submit" disabled={status === "saving"} className={`${btn.primary} w-full shadow-md sm:w-auto`}>
          {status === "saving" ? <><Spinner /> Saving…</> : status === "saved" ? <><Check className="size-5" /> Saved</> : "Save settings"}
        </button>
      </div>
    </form>
  );
}

type AiView = { settings: AiSettings; keys: Record<KeyProviderId, string | null>; appGemini: boolean };

const KEY_LABELS: Record<KeyProviderId, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
  openrouter: "OpenRouter",
  groq: "Groq",
  deepgram: "Deepgram",
  elevenlabs: "ElevenLabs",
};

/** Bring Your Own Key: provider, model, fallback, custom instructions and speech. Keys are stored encrypted on the server. */
export function AiAccess() {
  const [view, setView] = useState<AiView | null>(null);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [newKeys, setNewKeys] = useState<Partial<Record<KeyProviderId, string | null>>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai-settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((v: AiView) => {
        setView(v);
        setSettings(v.settings);
      })
      .catch(() => setError("Couldn't load AI settings."));
  }, []);

  if (!view || !settings) return error ? <Notice tone="error">{error}</Notice> : null;
  const info = providerInfo(settings.provider);
  const speech = SPEECH_PROVIDERS.find((p) => p.id === settings.speech.provider)!;
  const update = (patch: Partial<AiSettings>) => {
    setSettings({ ...settings, ...patch });
    setStatus("idle");
  };
  // Show key boxes for the chat provider and the speech provider; the rest stay as they are.
  const keyRows = KEY_PROVIDERS.filter((k) => k === settings.provider || k === speech.key || view.keys[k]);

  async function save() {
    setStatus("saving");
    setError(null);
    const keys = Object.fromEntries(Object.entries(newKeys).filter(([, v]) => v === null || (typeof v === "string" && v.trim())));
    const res = await fetch("/api/ai-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings, keys }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) {
      setStatus("idle");
      setError(data?.error ?? "Couldn't save AI settings.");
      return;
    }
    setView(data);
    setSettings(data.settings);
    setNewKeys({});
    setStatus("saved");
  }

  return (
    <Card id="ai" icon={<Sparks className="size-5" />} title="AI access">
      <p className="-mt-2 mb-4 text-sm text-muted">
        Free to use with the app&apos;s Gemini key{view.appGemini ? "" : " (not set up on this server)"}, or bring your own key for any provider below.
        Keys are encrypted and never shown again.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Labeled label="Provider">
          {(id) => (
            <select id={id} value={settings.provider} onChange={(e) => update({ provider: e.target.value as AiSettings["provider"], model: "", fallbackModel: "" })} className={input}>
              {AI_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </Labeled>
        <Labeled label="Model">
          {(id) =>
            info.freeText ? (
              <>
                <input id={id} list={`${id}-list`} value={settings.model} placeholder={info.defaultModel} onChange={(e) => update({ model: e.target.value.trim() })} className={input} />
                <datalist id={`${id}-list`}>
                  {info.models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </>
            ) : (
              <select id={id} value={settings.model || info.defaultModel} onChange={(e) => update({ model: e.target.value })} className={input}>
                {info.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )
          }
        </Labeled>
        <Labeled label="Fallback model">
          {(id) =>
            info.freeText ? (
              <input id={id} value={settings.fallbackModel} placeholder={info.defaultFallback || "None"} onChange={(e) => update({ fallbackModel: e.target.value.trim() })} className={input} />
            ) : (
              <select id={id} value={settings.fallbackModel} onChange={(e) => update({ fallbackModel: e.target.value })} className={input}>
                <option value="">Anthropic&apos;s automatic fallback</option>
                {info.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )
          }
        </Labeled>
      </div>

      <div className="mt-4">
        <Labeled label="Custom instructions (optional)">
          {(id) => (
            <textarea
              id={id}
              rows={3}
              maxLength={1500}
              value={settings.instructions}
              onChange={(e) => update({ instructions: e.target.value })}
              placeholder="I'm vegetarian and cook with very little oil. Keep answers short."
              className={`${input} h-auto resize-y py-3`}
            />
          )}
        </Labeled>
      </div>

      <h3 className="mb-2 mt-6 flex items-center gap-1.5 text-sm font-semibold">
        <Microphone className="size-4" /> Voice input
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Labeled label="Speech to text">
          {(id) => (
            <select id={id} value={settings.speech.provider} onChange={(e) => update({ speech: { ...settings.speech, provider: e.target.value as AiSettings["speech"]["provider"] } })} className={input}>
              {SPEECH_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </Labeled>
        <Labeled label={`Language for ${speech.label}`}>
          {(id) => (
            <select
              id={id}
              value={settings.speech.languages[speech.id] ?? "en-IN"}
              onChange={(e) => update({ speech: { ...settings.speech, languages: { ...settings.speech.languages, [speech.id]: e.target.value } } })}
              className={input}
            >
              {languagesFor(speech.id).map((l) => (
                <option key={l.locale} value={l.locale}>
                  {l.label}
                </option>
              ))}
            </select>
          )}
        </Labeled>
      </div>
      <p className="mt-1.5 text-xs text-muted">{speech.hint}</p>

      <h3 className="mb-2 mt-6 flex items-center gap-1.5 text-sm font-semibold">
        <Key className="size-4" /> API keys
      </h3>
      <ul className="space-y-2">
        {keyRows.map((k) => {
          const stored = view.keys[k];
          const pending = newKeys[k];
          const url = AI_PROVIDERS.find((p) => p.id === k)?.keyUrl;
          return (
            <li key={k} className="flex flex-wrap items-center gap-2 rounded-2xl border border-line p-3">
              <span className="w-36 text-sm font-medium">{KEY_LABELS[k]}</span>
              {pending === null ? (
                <span className="flex-1 text-sm text-danger">Will be removed when you save</span>
              ) : (
                <input
                  type="password"
                  autoComplete="off"
                  aria-label={`${KEY_LABELS[k]} API key`}
                  value={pending ?? ""}
                  placeholder={stored ? `Saved (${stored}). Paste to replace` : k === "gemini" && view.appGemini ? "Optional: using the app's key" : "Paste your API key"}
                  onChange={(e) => {
                    setNewKeys({ ...newKeys, [k]: e.target.value });
                    setStatus("idle");
                  }}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm focus:border-leaf focus:outline-none"
                />
              )}
              {stored && pending !== null && (
                <button type="button" onClick={() => setNewKeys({ ...newKeys, [k]: null })} className="text-sm font-medium text-muted hover:text-danger">
                  Remove
                </button>
              )}
              {url && (
                <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-leaf underline-offset-2 hover:underline">
                  Get a key
                </a>
              )}
            </li>
          );
        })}
      </ul>

      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      <button type="button" onClick={save} disabled={status === "saving"} className={`${btn.primary} mt-5`}>
        {status === "saving" ? <><Spinner /> Saving…</> : status === "saved" ? <><Check className="size-5" /> Saved</> : "Save AI settings"}
      </button>
    </Card>
  );
}
