"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Camera, MediaImage, ScanBarcode, Xmark } from "iconoir-react";
import type { Micros } from "@/lib/nutrients";
import { NUTRIENTS, type FoodItem } from "@/lib/nutrition";
import { Notice, Spinner, btn, input } from "./ui";

type Lookup = {
  name: string;
  servingGrams: number | null;
  per100g: Omit<FoodItem, "name" | "grams" | "micros" | "unit" | "unit_grams">;
  micros100g: Micros;
};

const noSubscribe = () => () => {};
const liveCameraAvailable = () => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

async function reader() {
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  return new BrowserMultiFormatReader();
}

/**
 * Scan a packaged food's barcode (live camera, a photo of it, or typed digits) and look it up in Open Food Facts.
 * Live camera needs https or localhost; the photo option works everywhere.
 */
export function BarcodeScanner({ onFound }: { onFound: (item: FoodItem) => void }) {
  const [live, setLive] = useState(false);
  const canLive = useSyncExternalStore(noSubscribe, liveCameraAvailable, () => false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const codeId = useId();

  useEffect(() => () => controls.current?.stop(), []);

  async function lookup(raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 6) {
      setError("Enter the numbers printed under the barcode.");
      return;
    }
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      const res = await fetch(`/api/barcode?code=${digits}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't find that product.");
      const { name, servingGrams, per100g, micros100g } = data as Lookup;
      const grams = servingGrams && servingGrams > 0 ? servingGrams : 100;
      const item = { name, grams } as FoodItem;
      for (const n of NUTRIENTS) item[n] = (per100g[n] * grams) / 100;
      item.micros = Object.fromEntries(Object.entries(micros100g ?? {}).map(([k, v]) => [k, (v * grams) / 100]));
      // The pack's own serving becomes the unit, so "2 servings" works like "2 rotis".
      if (servingGrams && servingGrams > 0) {
        item.unit = "serving";
        item.unit_grams = servingGrams;
      }
      onFound(item);
      setFound(name);
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't find that product.");
    } finally {
      setBusy(false);
    }
  }

  async function startLive() {
    setError(null);
    setFound(null);
    setLive(true);
    try {
      const r = await reader();
      controls.current = await r.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current!,
        (result, _err, ctl) => {
          if (!result) return;
          ctl.stop();
          setLive(false);
          lookup(result.getText());
        },
      );
    } catch {
      setLive(false);
      setError("Couldn't open the camera. Allow camera access, or take a photo of the barcode instead.");
    }
  }

  function stopLive() {
    controls.current?.stop();
    setLive(false);
  }

  async function fromPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setFound(null);
    setBusy(true);
    const url = URL.createObjectURL(file);
    try {
      const result = await (await reader()).decodeFromImageUrl(url);
      await lookup(result.getText());
    } catch {
      setError("No barcode found in that photo. Get closer, keep it flat and in focus, or type the numbers.");
      setBusy(false);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    lookup(code);
  }

  return (
    <div className="space-y-4">
      <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { fromPhoto(e.target.files?.[0]); e.target.value = ""; }} />

      <div className={`relative overflow-hidden rounded-3xl bg-black ${live ? "" : "hidden"}`}>
        <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full object-cover" />
        <div className="pointer-events-none absolute inset-x-10 top-1/2 h-0.5 -translate-y-1/2 bg-protein/80 shadow-[0_0_12px_var(--protein)]" />
        <button type="button" onClick={stopLive} aria-label="Stop scanning" className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/70">
          <Xmark className="size-5" />
        </button>
        <p className="absolute inset-x-0 bottom-3 text-center text-sm font-medium text-white/90">Hold the barcode inside the frame</p>
      </div>

      {!live && (
        <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-line bg-surface px-6 py-8 text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-leaf-soft text-leaf">
            {busy ? <Spinner className="size-7" /> : <ScanBarcode className="size-8" />}
          </span>
          <p className="mt-4 font-display text-lg font-semibold">Scan a packaged food</p>
          <p className="mt-1 max-w-xs text-[15px] text-muted">Biscuits, namkeen, drinks, cereals: anything with a barcode.</p>
          <div className="mt-6 flex w-full max-w-sm flex-col gap-2.5 sm:flex-row">
            {canLive && (
              <button type="button" onClick={startLive} disabled={busy} className={`${btn.primary} sm:flex-1`}>
                <Camera className="size-5" /> Scan
              </button>
            )}
            <button type="button" onClick={() => photoRef.current?.click()} disabled={busy} className={`${canLive ? btn.secondary : btn.primary} sm:flex-1`}>
              <MediaImage className="size-5" /> Photo of barcode
            </button>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit}>
        <label htmlFor={codeId} className="mb-1.5 block text-sm font-medium">Or type the barcode number</label>
        <div className="flex gap-2">
          <input id={codeId} inputMode="numeric" autoComplete="off" value={code} maxLength={14} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="8901234567890" className={`${input} num`} />
          <button type="submit" disabled={busy || code.length < 6} className={`${btn.secondary} h-11 shrink-0`}>
            Look up
          </button>
        </div>
      </form>

      {found && <Notice>Added {found}. Check the grams below; scan again to add more.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <p className="text-xs text-muted">Product data from Open Food Facts, a free community database.</p>
    </div>
  );
}
