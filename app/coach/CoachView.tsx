"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Copy, MediaImage, RefreshDouble, Send, Sparks, Trash, Xmark } from "iconoir-react";
import { IconButton, Notice, Spinner } from "@/components/ui";
import { preparePhoto, type PreparedPhoto } from "@/lib/image";
import type { Goal } from "@/lib/nutrition";

type Message = { id: number; role: "user" | "assistant"; content: string; photo: string | null; created_at: string };

const CHIPS: Record<Goal | "none", string[]> = {
  lose: [
    "What's my expected weight in 30 days?",
    "How do I hit my protein with fewer calories?",
    "Am I under-logging anything?",
    "How did my training go this week?",
  ],
  gain: [
    "What's my expected weight in 30 days?",
    "Easy ways to add 300 kcal a day?",
    "Am I eating enough protein to build muscle?",
    "How did my training go this week?",
  ],
  maintain: [
    "Am I staying within my maintenance?",
    "How balanced were my meals this week?",
    "Which nutrients am I low on?",
    "How did my training go this week?",
  ],
  none: ["What should I set as my goals?", "What can you help me with?", "How do I log meals quickly?", "Plan a high-protein Indian day"],
};

export function CoachView() {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [pending, setPending] = useState<{ text: string; photo: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ text: string; photo: PreparedPhoto | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/coach", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setMessages(d.messages);
        setGoal(d.goal);
      })
      .catch(() => setError("Couldn't load the conversation. Refresh to try again."));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  async function send(body: { text: string; photo: PreparedPhoto | null }) {
    if (!body.text.trim() && !body.photo) return;
    setError(null);
    setFailed(null);
    setPending({ text: body.text, photo: body.photo?.thumb ?? null });
    setText("");
    setPhoto(null);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: body.text.trim(),
          photo: body.photo ? { preview: body.photo.preview, thumb: body.photo.thumb } : null,
          language: navigator.language?.match(/^[a-z]{2}(-[A-Z]{2})?$/)?.[0] ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessages(data.messages);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "The Coach couldn't answer right now.");
      setFailed(body);
    } finally {
      setPending(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send({ text, photo });
  }

  async function copy(content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked (e.g. http on a phone): nothing to do
    }
  }

  async function reset() {
    setConfirmReset(false);
    const res = await fetch("/api/coach", { method: "DELETE" }).catch(() => null);
    if (res?.ok) setMessages([]);
  }

  async function attach(file: File | undefined) {
    if (!file?.type.startsWith("image/")) return;
    try {
      setPhoto(await preparePhoto(file));
    } catch {
      setError("Couldn't open that photo.");
    }
  }

  const chips = CHIPS[goal ?? "none"];

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-3xl flex-col px-4 sm:px-6 lg:min-h-dvh lg:px-10">
      <header className="flex items-center justify-between gap-3 pb-4 pt-[max(1.5rem,env(safe-area-inset-top))] lg:pt-10">
        <div>
          <h1 className="font-display text-[40px] font-bold leading-none tracking-[-0.04em] sm:text-5xl">Coach</h1>
          <p className="mt-2 text-[15px] text-muted">Ask about your food, weight, workouts and fasting. It sees your live data.</p>
        </div>
        {messages && messages.length > 0 &&
          (confirmReset ? (
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={() => setConfirmReset(false)} className="h-10 rounded-full px-3 text-sm text-muted">
                Keep
              </button>
              <button type="button" onClick={reset} className="h-10 rounded-full bg-danger px-3 text-sm font-semibold text-white">
                Reset
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmReset(true)} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line px-3 text-sm text-muted hover:text-ink">
              <Trash className="size-4" /> Reset
            </button>
          ))}
      </header>

      <div className="flex-1 space-y-3 pb-4" aria-live="polite">
        {!messages ? (
          error ? <Notice tone="error">{error}</Notice> : <div className="h-40 animate-pulse rounded-3xl bg-surface-2" aria-hidden="true" />
        ) : messages.length === 0 && !pending ? (
          <div className="card px-5 py-8 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-leaf to-lime text-on-leaf shadow-glow">
              <Sparks className="size-7" />
            </span>
            <p className="mt-4 font-display text-xl font-bold">Your coach remembers this chat</p>
            <p className="mx-auto mt-1 max-w-sm text-[15px] text-muted">Try one of these, or attach a photo of your plate.</p>
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} onCopy={copy} />)
        )}
        {pending && (
          <>
            <Bubble message={{ id: -1, role: "user", content: pending.text, photo: pending.photo, created_at: "" }} onCopy={copy} />
            <div className="flex items-center gap-2 text-sm text-muted">
              <span className="flex gap-1" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-2 animate-bounce rounded-full bg-leaf" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </span>
              Coach is looking at your data…
            </div>
          </>
        )}
        {error && messages && (
          <div className="space-y-2">
            <Notice tone="error">{error}</Notice>
            {failed && (
              <button type="button" onClick={() => send(failed)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-leaf px-4 text-sm font-semibold text-on-leaf">
                <RefreshDouble className="size-4" /> Retry
              </button>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 bg-paper/95 px-4 pb-3 pt-2 backdrop-blur lg:bottom-0 lg:mx-0 lg:px-0">
        {messages && !pending && (
          <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
            {chips.map((c) => (
              <button key={c} type="button" onClick={() => send({ text: c, photo: null })} className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-2 text-sm hover:border-leaf hover:text-leaf">
                {c}
              </button>
            ))}
          </div>
        )}
        {photo && (
          <div className="mb-2 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.thumb} alt="Attached" className="size-14 rounded-xl object-cover" />
            <IconButton label="Remove photo" onClick={() => setPhoto(null)} className="size-9">
              <Xmark className="size-4" />
            </IconButton>
          </div>
        )}
        <form onSubmit={onSubmit} className="flex items-end gap-1.5 rounded-[26px] border border-line bg-surface p-1.5 shadow-md focus-within:border-leaf">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void attach(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => { void attach(e.target.files?.[0]); e.target.value = ""; }} />
          <IconButton label="Take a photo" onClick={() => cameraRef.current?.click()} className="size-10 shrink-0">
            <Camera className="size-5" />
          </IconButton>
          <IconButton label="Attach a photo" onClick={() => galleryRef.current?.click()} className="size-10 shrink-0">
            <MediaImage className="size-5" />
          </IconButton>
          <label className="sr-only" htmlFor="coach-input">Message</label>
          <textarea
            id="coach-input"
            rows={1}
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send({ text, photo });
              }
            }}
            placeholder="Ask your coach…"
            className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-base focus:outline-none [field-sizing:content]"
          />
          <button type="submit" aria-label="Send" disabled={!!pending || (!text.trim() && !photo)} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-leaf text-on-leaf disabled:opacity-40">
            {pending ? <Spinner className="size-4" /> : <Send className="size-5" />}
          </button>
        </form>
      </div>

      {copied && (
        <div role="status" className="fixed inset-x-0 bottom-36 z-50 mx-auto w-fit animate-rise rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper shadow-md">
          Copied
        </div>
      )}
    </div>
  );
}

/** A message bubble. Long-press (or the copy button) copies a reply. */
function Bubble({ message, onCopy }: { message: Message; onCopy: (text: string) => void }) {
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mine = message.role === "user";
  const cancel = () => hold.current && clearTimeout(hold.current);

  return (
    <div className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        onPointerDown={() => {
          if (mine) return;
          hold.current = setTimeout(() => onCopy(message.content), 550);
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => !mine && e.preventDefault()}
        className={`relative max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-[15px] leading-relaxed ${
          mine ? "rounded-br-lg bg-leaf text-on-leaf" : "select-text rounded-bl-lg border border-line bg-surface shadow-sm"
        }`}
      >
        {message.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={message.photo} alt="Attached photo" className="mb-2 size-32 rounded-2xl object-cover" />
        )}
        {message.content}
        {!mine && (
          <button
            type="button"
            onClick={() => onCopy(message.content)}
            aria-label="Copy reply"
            className="absolute -bottom-3 right-3 flex size-7 items-center justify-center rounded-full border border-line bg-surface text-muted opacity-0 shadow-sm transition-opacity hover:text-ink focus:opacity-100 group-hover:opacity-100"
          >
            <Copy className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
