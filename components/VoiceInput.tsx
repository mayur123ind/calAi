"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Microphone, Square } from "iconoir-react";
import { SPEECH_LANGUAGES, SPEECH_PROVIDERS, type AiSettings } from "@/lib/ai/catalog";
import { Notice, Spinner } from "./ui";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

const recognitionClass = () =>
  (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition })
    .SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

/** Speak a meal: on-device recognition, or a recording sent to the person's chosen speech provider. */
export function VoiceInput({ onText }: { onText: (text: string) => void }) {
  const [settings, setSettings] = useState<AiSettings["speech"] | null>(null);
  const [state, setState] = useState<"idle" | "listening" | "sending">("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    fetch("/api/ai-settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setSettings(d.settings.speech))
      .catch(() => setSettings({ provider: "browser", languages: {} }));
    return () => stopRef.current();
  }, []);

  if (!settings) return <div className="h-40 animate-pulse rounded-3xl bg-surface-2" aria-hidden="true" />;
  const provider = SPEECH_PROVIDERS.find((p) => p.id === settings.provider)!;
  const locale = settings.languages[settings.provider] ?? "en-IN";
  const language = SPEECH_LANGUAGES.find((l) => l.locale === locale)?.label ?? locale;

  function listenOnDevice() {
    const Rec = recognitionClass();
    if (!Rec) {
      setError("This browser can't recognise speech on the device. Use Chrome, Edge or Safari, or pick a speech provider under Account → AI access.");
      return;
    }
    const rec = new Rec();
    rec.lang = locale;
    rec.continuous = true;
    rec.interimResults = true;
    let finalText = "";
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += `${r[0].transcript} `;
        else live += r[0].transcript;
      }
      setInterim((finalText + live).trim());
    };
    rec.onerror = (e) => {
      if (e.error !== "aborted" && e.error !== "no-speech") {
        setError(e.error === "not-allowed" ? "Allow the microphone in your browser to speak your meal." : "Speech recognition stopped. Try again.");
      }
    };
    rec.onend = () => {
      setState("idle");
      setInterim("");
      if (finalText.trim()) onText(finalText.trim());
    };
    stopRef.current = () => rec.stop();
    rec.start();
    setState("listening");
  }

  async function record() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Allow the microphone in your browser to speak your meal.");
      return;
    }
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (blob.size === 0) return setState("idle");
      setState("sending");
      const form = new FormData();
      form.append("audio", blob, "speech");
      try {
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Couldn't transcribe that.");
        if (data.text) onText(data.text);
        else setError("Didn't catch anything. Try again, a little closer to the microphone.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't transcribe that.");
      } finally {
        setState("idle");
      }
    };
    stopRef.current = () => recorder.state !== "inactive" && recorder.stop();
    recorder.start();
    setState("listening");
  }

  function toggle() {
    setError(null);
    if (state === "listening") return stopRef.current();
    if (settings!.provider === "browser") listenOnDevice();
    else void record();
  }

  return (
    <div className="card flex flex-col items-center px-6 py-8 text-center">
      <button
        type="button"
        onClick={toggle}
        disabled={state === "sending"}
        aria-label={state === "listening" ? "Stop" : "Start speaking"}
        className={`flex size-20 items-center justify-center rounded-[26px] text-on-leaf shadow-glow transition-transform active:scale-95 ${
          state === "listening" ? "animate-pulse bg-protein" : "bg-gradient-to-br from-leaf to-lime"
        }`}
      >
        {state === "sending" ? <Spinner className="size-8" /> : state === "listening" ? <Square className="size-8" /> : <Microphone className="size-9" />}
      </button>
      <p className="mt-4 font-display text-xl font-bold tracking-tight">
        {state === "listening" ? "Listening… tap to stop" : state === "sending" ? "Transcribing…" : "Tap and say what you ate"}
      </p>
      <p className="mt-1 max-w-xs text-sm text-muted">
        &ldquo;Two rotis, a katori of dal and some cucumber raita&rdquo;
      </p>
      {interim && <p className="mt-3 max-w-sm text-[15px]">{interim}</p>}
      <p className="mt-4 text-xs text-muted">
        {provider.label} · {language} ·{" "}
        <Link href="/account#ai" className="font-medium text-leaf underline-offset-2 hover:underline">
          Change
        </Link>
      </p>
      {error && (
        <div className="mt-3 w-full text-left">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {state === "listening" ? "Listening" : ""}
      </span>
    </div>
  );
}
