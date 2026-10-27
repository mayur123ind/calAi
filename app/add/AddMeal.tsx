"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type DragEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  Camera,
  EditPencil,
  MediaImage,
  Microphone,
  Plus,
  RefreshDouble,
  ScanBarcode,
  Sparks,
  Star,
  Text,
  Xmark,
} from "iconoir-react";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { CameraCapture } from "@/components/CameraCapture";
import { Notice, PageHeader, Segmented, Spinner, btn, input } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { dayKey, dayTitle, isDayKey } from "@/lib/dates";
import { preparePhoto, type PreparedPhoto } from "@/lib/image";
import { blankItem, toEdit, toSaved, type Confidence, type EditItem } from "@/lib/items";
import { DEFAULT_PREFS, MEAL_TYPES, fmt, fmt1, mealTypeAt, sumItems, type FoodItem, type Meal, type MealType } from "@/lib/nutrition";
import { ItemEditor } from "./ItemEditor";
import { SavedMeals } from "./SavedMeals";
import { WhatIf } from "./WhatIf";

type Mode = "scan" | "describe" | "voice" | "manual" | "saved";
type ScanMode = "camera" | "photos" | "barcode";
type AnalyzeResponse = { items: (FoodItem & { confidence: Confidence })[]; question: string };

const MAX_PHOTOS = 10;
const noSubscribe = () => () => {};
const liveCameraAvailable = () => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

export function AddMeal() {
  const router = useRouter();
  const params = useSearchParams();
  const today = dayKey();
  const requested = params.get("date");
  const editId = Number(params.get("edit")) || null;
  const canLive = useSyncExternalStore(noSubscribe, liveCameraAvailable, () => false);

  const [mode, setMode] = useState<Mode>("scan");
  const [scan, setScan] = useState<ScanMode>("camera");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [note, setNote] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<EditItem[]>([]);
  const [question, setQuestion] = useState("");
  const [mealType, setMealType] = useState<MealType>(() => mealTypeAt(new Date()));
  const [busy, setBusy] = useState<"photo" | "analyze" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false); // analysis failed: offer Retry / Cancel
  const [dragging, setDragging] = useState(false);
  const [slow, setSlow] = useState(false);
  const [editing, setEditing] = useState<Meal | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const day = editing?.day ?? (isDayKey(requested) && requested <= today ? requested : today);
  const backHref = day === today ? "/" : `/?date=${day}`;

  // The meal is guessed from the person's own meal start times.
  useEffect(() => {
    if (editId) return;
    fetch("/api/prefs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => p && setMealType(mealTypeAt(new Date(), { ...DEFAULT_PREFS.mealTimes, ...p.mealTimes })))
      .catch(() => {});
  }, [editId]);

  useEffect(() => {
    if (!editId) return;
    let alive = true;
    fetch(`/api/meals/${editId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((m: Meal) => {
        if (!alive) return;
        setEditing(m);
        setItems(m.items.map((i) => toEdit(i)));
        setMealType(m.meal_type);
        setNote(m.note ?? "");
      })
      .catch(() => alive && setError("Couldn't load this meal. It may have been deleted."));
    return () => {
      alive = false;
    };
  }, [editId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const showResults = () =>
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));

  async function takeFiles(files: File[]) {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setError(`Up to ${MAX_PHOTOS} photos per meal.`);
      return;
    }
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      setError("That file isn't a photo. Choose a JPEG or PNG image.");
      return;
    }
    setError(images.length > room ? `Only the first ${room} were added: up to ${MAX_PHOTOS} photos per meal.` : null);
    setBusy("photo");
    try {
      const prepared = await Promise.all(images.slice(0, room).map(preparePhoto));
      setPhotos((p) => [...p, ...prepared].slice(0, MAX_PHOTOS));
    } catch {
      setError("Couldn't open one of the photos. Try a JPEG or PNG, or take a new one.");
    } finally {
      setBusy(null);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void takeFiles([...(e.dataTransfer.files ?? [])]);
  }

  async function analyze() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setFailed(false);
    setBusy("analyze");
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), 8000);
    try {
      const body =
        mode === "scan"
          ? { images: photos.map((p) => ({ base64: p.base64, mimeType: "image/jpeg" })), note }
          : { note: description };
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't estimate this meal.");
      const result = data as AnalyzeResponse;
      setItems(result.items.map(toEdit));
      setQuestion(result.items.length === 0 && !result.question ? "No food found. Try clearer photos, or add the items by hand." : result.question);
      showResults();
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Couldn't estimate this meal.");
      setFailed(true);
    } finally {
      clearTimeout(slowTimer);
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(null);
      }
    }
  }

  function cancelAnalysis() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(null);
    setFailed(false);
    setError(null);
  }

  function addItems(list: FoodItem[], type?: MealType) {
    setItems((current) => [...current, ...list.map((i) => toEdit(i))]);
    if (type) setMealType(type);
    showResults();
  }

  /** Manual entry starts unlocked: you type calories and macros straight in. */
  function addBlank() {
    setItems((current) => [...current, { ...toEdit(blankItem()), locked: false }]);
    showResults();
  }

  async function save() {
    const valid = items.filter((i) => i.name.trim());
    if (valid.length === 0) {
      setError("Add at least one item with a name before saving.");
      return;
    }
    setError(null);
    setBusy("save");
    const payloadItems = valid.map(toSaved);
    const mealNote = (mode === "scan" ? note : mode === "describe" || mode === "voice" ? description : note).trim() || null;
    try {
      const res = editing
        ? await fetch(`/api/meals/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ meal_type: mealType, note: note.trim() || null, items: payloadItems }),
          })
        : await fetch("/api/meals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              day,
              meal_type: mealType,
              note: mealNote,
              // The first photo's thumbnail is kept with the meal.
              photo: mode === "scan" ? (photos[0]?.thumb ?? null) : null,
              items: payloadItems,
            }),
          });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't save the meal.");
      router.push(backHref);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the meal.");
      setBusy(null);
    }
  }

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setFailed(false);
    if (m === "manual" && items.length === 0) addBlank();
  }

  const totals = sumItems(items);
  const aiMode = mode === "scan" ? scan !== "barcode" : mode === "describe" || mode === "voice";
  const canAnalyze = mode === "scan" ? photos.length > 0 : description.trim().length > 2;

  return (
    <div className="stagger mx-auto max-w-2xl px-4 sm:px-6">
      <PageHeader
        title={
          <span className="flex items-center gap-1">
            <Link href={backHref} aria-label="Back" className="-ml-2 inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink lg:hidden">
              <ArrowLeft className="size-6" />
            </Link>
            {editId ? "Edit meal" : "Log a meal"}
          </span>
        }
        sub={day === today ? undefined : `For ${dayTitle(day).toLowerCase() === "yesterday" ? "yesterday" : dayTitle(day)}`}
      />

      <div className="space-y-5">
        {editId ? (
          editing ? (
            <div className="flex items-center gap-3 card p-3 shadow-sm">
              {editing.photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={editing.photo} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-sm font-medium" htmlFor="edit-note">Note</label>
                <input id="edit-note" className={input} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
              </div>
            </div>
          ) : (
            !error && <div className="h-24 animate-pulse rounded-2xl bg-surface-2" aria-hidden="true" />
          )
        ) : (
          <>
            <ModePicker value={mode} onChange={switchMode} />

            {mode === "scan" && (
              <div className="space-y-4">
                <Segmented
                  label="Photo and scan"
                  value={scan}
                  onChange={(s) => {
                    setScan(s);
                    setError(null);
                  }}
                  options={[
                    { value: "camera", label: <><Camera className="size-[18px]" /> Camera</> },
                    { value: "photos", label: <><MediaImage className="size-[18px]" /> Photos</> },
                    { value: "barcode", label: <><ScanBarcode className="size-[18px]" /> Barcode</> },
                  ]}
                />
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void takeFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
                <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void takeFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />

                {scan === "barcode" ? (
                  <BarcodeScanner onFound={(item) => addItems([item])} />
                ) : (
                  <>
                    {photos.length > 0 ? (
                      <PhotoStrip
                        photos={photos}
                        scanning={busy === "analyze"}
                        onRemove={(i) => setPhotos((p) => p.filter((_, j) => j !== i))}
                        onAdd={photos.length < MAX_PHOTOS ? () => (scan === "camera" && canLive ? setCameraOpen(true) : scan === "camera" ? cameraRef.current?.click() : galleryRef.current?.click()) : undefined}
                      />
                    ) : (
                      <div
                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={onDrop}
                        className={`card relative flex flex-col items-center overflow-hidden px-6 py-10 text-center transition-[background-color,transform] duration-500 ease-out-expo sm:py-12 ${dragging ? "scale-[1.01] bg-leaf-soft" : ""}`}
                      >
                        <span aria-hidden="true" className="absolute left-4 top-4 size-7 rounded-tl-2xl border-l-[3px] border-t-[3px] border-leaf" />
                        <span aria-hidden="true" className="absolute right-4 top-4 size-7 rounded-tr-2xl border-r-[3px] border-t-[3px] border-leaf" />
                        <span aria-hidden="true" className="absolute bottom-4 left-4 size-7 rounded-bl-2xl border-b-[3px] border-l-[3px] border-leaf" />
                        <span aria-hidden="true" className="absolute bottom-4 right-4 size-7 rounded-br-2xl border-b-[3px] border-r-[3px] border-leaf" />
                        <span className="float flex size-20 items-center justify-center rounded-[26px] bg-gradient-to-br from-leaf to-lime text-on-leaf shadow-glow">
                          {busy === "photo" ? <Spinner className="size-8" /> : scan === "camera" ? <Camera className="size-9" /> : <MediaImage className="size-9" />}
                        </span>
                        <p className="mt-5 font-display text-2xl font-bold tracking-[-0.03em]">
                          {scan === "camera" ? "Photograph your plate" : "Choose meal photos"}
                        </p>
                        <p className="mt-1 max-w-xs text-[15px] text-muted">
                          {scan === "camera"
                            ? "Keep shooting: different angles or separate dishes, up to 10 photos analysed together."
                            : "Pick up to 10 photos of the same meal; they're analysed together."}
                        </p>
                        <button
                          type="button"
                          onClick={() => (scan === "camera" ? (canLive ? setCameraOpen(true) : cameraRef.current?.click()) : galleryRef.current?.click())}
                          className={`${btn.primary} mt-6 w-full max-w-xs`}
                        >
                          {scan === "camera" ? <><Camera className="size-5" /> Open camera</> : <><MediaImage className="size-5" /> Choose photos</>}
                        </button>
                        <p className="mt-4 hidden text-sm text-muted lg:block">or drop images here</p>
                      </div>
                    )}

                    <Field label="Anything the photos can't show?" hint="Optional">
                      {(id) => <input id={id} className={input} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="2 rotis with ghee, dal has cream" />}
                    </Field>
                  </>
                )}
              </div>
            )}

            {mode === "describe" && (
              <Field label="What did you eat?">
                {(id) => (
                  <textarea
                    id={id}
                    rows={4}
                    maxLength={600}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={"2 phulka, 1 katori dal tadka, cucumber salad\nMasala chai with sugar"}
                    className={`${input} h-auto resize-none py-3 leading-relaxed`}
                  />
                )}
              </Field>
            )}

            {mode === "voice" && (
              <div className="space-y-3">
                <VoiceInput onText={(t) => setDescription((d) => (d.trim() ? `${d.trim()} ${t}` : t))} />
                {description && (
                  <Field label="What you said" hint="Edit if needed">
                    {(id) => (
                      <textarea id={id} rows={3} maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} className={`${input} h-auto resize-none py-3 leading-relaxed`} />
                    )}
                  </Field>
                )}
              </div>
            )}

            {mode === "manual" && (
              <p className="text-[15px] text-muted">
                Know the numbers already? Type the calories and macros from a label or recipe. No AI involved.
              </p>
            )}

            {mode === "saved" && <SavedMeals onPick={addItems} />}
          </>
        )}

        {error && (
          <div className="space-y-2">
            <Notice tone="error">{error}</Notice>
            {failed && (
              <div className="flex gap-2">
                <button type="button" onClick={analyze} className={`${btn.primary} h-10 px-5 text-sm`}>
                  <RefreshDouble className="size-4" /> Retry
                </button>
                <button type="button" onClick={cancelAnalysis} className={`${btn.secondary} h-10 px-5 text-sm`}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {!editId && aiMode && !failed && (
          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:justify-between">
            {busy === "analyze" ? (
              <div className="flex gap-2 sm:flex-row-reverse">
                <span className={`${btn.primary} pointer-events-none flex-1 sm:min-w-56`}>
                  <Spinner /> {mode === "scan" && photos.length > 1 ? `Reading ${photos.length} photos…` : "Reading your meal…"}
                </span>
                <button type="button" onClick={cancelAnalysis} className={btn.secondary}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" onClick={analyze} disabled={!canAnalyze || busy !== null} className={`${btn.primary} w-full sm:w-auto sm:min-w-56`}>
                <Sparks className="size-5" /> {items.length ? "Estimate again" : "Estimate calories"}
              </button>
            )}
            {items.length === 0 && busy !== "analyze" && (
              <button type="button" onClick={addBlank} className={btn.ghost}>
                Enter food by hand
              </button>
            )}
          </div>
        )}
        {busy === "analyze" && slow && (
          <p role="status" className="text-center text-sm text-muted sm:text-right">
            The AI is busy. If it&apos;s overloaded we retry automatically; this can take up to a minute.
          </p>
        )}

        {(items.length > 0 || question || editing) && (
          <section ref={resultsRef} aria-labelledby="check-heading" className="scroll-mt-4 space-y-4 pt-2">
            <div>
              <h2 id="check-heading" className="font-display text-xl font-semibold tracking-tight">Review nutrition</h2>
              <p className="mt-0.5 text-[15px] text-muted">Change the serving and everything scales. Unlock an item to correct its numbers.</p>
            </div>

            {question && <Notice>{question}</Notice>}

            <ul className="space-y-3">
              {items.map((item) => (
                <ItemEditor
                  key={item.key}
                  item={item}
                  onChange={(next) => setItems((list) => list.map((i) => (i.key === item.key ? next : i)))}
                  onRemove={() => setItems((list) => list.filter((i) => i.key !== item.key))}
                />
              ))}
            </ul>

            <button type="button" onClick={addBlank} className={`${btn.ghost} text-leaf`}>
              <Plus className="size-[18px]" /> Add an item
            </button>

            <div>
              <p className="mb-2 text-sm font-medium">Which meal is this?</p>
              <Segmented label="Meal" value={mealType} onChange={setMealType} options={MEAL_TYPES.map((t) => ({ value: t.id, label: t.label }))} />
            </div>

            {items.some((i) => i.name.trim()) && <WhatIf day={day} mealType={mealType} items={items} editingId={editing?.id ?? null} />}

            {/* Totals + save: pinned to the bottom on phones */}
            <div className="sticky bottom-0 -mx-4 border-t border-line bg-paper/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mx-0 sm:rounded-2xl sm:border sm:bg-surface sm:p-4 sm:shadow-sm">
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="num font-display text-2xl font-semibold leading-none">
                    {fmt(totals.calories)} <span className="text-base font-medium text-muted">kcal</span>
                  </p>
                  <p className="num mt-1.5 flex gap-3 text-sm text-muted">
                    <span><b className="font-semibold text-protein">P</b> {fmt1(totals.protein_g)}g</span>
                    <span><b className="font-semibold text-carbs">C</b> {fmt1(totals.carbs_g)}g</span>
                    <span><b className="font-semibold text-fat">F</b> {fmt1(totals.fat_g)}g</span>
                  </p>
                </div>
                <button type="button" onClick={save} disabled={busy !== null || items.length === 0} className={btn.primary}>
                  {busy === "save" ? <><Spinner /> Saving…</> : editing ? "Save changes" : "Log meal"}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      {cameraOpen && (
        <CameraCapture
          remaining={MAX_PHOTOS - photos.length}
          taken={photos.map((p) => p.thumb)}
          onShot={(file) => void takeFiles([file])}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
}

const MODES: { value: Mode; label: string; icon: ReactNode }[] = [
  { value: "scan", label: "Photo & Scan", icon: <Camera className="size-6" /> },
  { value: "describe", label: "Describe", icon: <Text className="size-6" /> },
  { value: "voice", label: "Voice", icon: <Microphone className="size-6" /> },
  { value: "manual", label: "Manual", icon: <EditPencil className="size-6" /> },
  { value: "saved", label: "Saved", icon: <Star className="size-6" /> },
];

function ModePicker({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  return (
    <div role="radiogroup" aria-label="How to log" className="grid grid-cols-5 gap-1.5">
      {MODES.map((m) => {
        const active = m.value === value;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m.value)}
            className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 text-center text-xs font-medium leading-tight transition-[background-color,border-color,color] duration-300 ${
              active ? "border-leaf bg-leaf-soft text-leaf-strong" : "border-line bg-surface/80 text-muted hover:text-ink"
            }`}
          >
            {m.icon}
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

/** Photos of the meal side by side, with remove buttons and room for more. */
function PhotoStrip({ photos, scanning, onRemove, onAdd }: { photos: PreparedPhoto[]; scanning: boolean; onRemove: (i: number) => void; onAdd?: () => void }) {
  return (
    <div>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {photos.map((p, i) => (
          <div key={i} className="relative h-56 w-44 shrink-0 snap-start overflow-hidden rounded-3xl bg-surface-2 shadow-md sm:h-64 sm:w-52">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.preview} alt={`Meal photo ${i + 1}`} className="size-full object-cover" />
            {scanning && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[#06150e]/20">
                <div className="absolute inset-x-0 h-20 animate-[scan_1.8s_ease-in-out_infinite_alternate] bg-gradient-to-b from-transparent via-lime/35 to-transparent">
                  <div className="absolute inset-x-0 top-1/2 h-0.5 bg-lime shadow-[0_0_16px_4px_rgb(163_230_53/0.7)]" />
                </div>
              </div>
            )}
            {!scanning && (
              <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => onRemove(i)} className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/70">
                <Xmark className="size-5" />
              </button>
            )}
            <span className="num absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-medium text-white">{i + 1}</span>
          </div>
        ))}
        {onAdd && !scanning && (
          <button type="button" onClick={onAdd} className="flex h-56 w-32 shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line text-sm font-medium text-muted hover:border-leaf hover:text-leaf sm:h-64">
            <Plus className="size-6" /> Add more
          </button>
        )}
      </div>
      <p className="num mt-1.5 text-xs text-muted">{photos.length} of {MAX_PHOTOS} photos · analysed together as one meal</p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-sm font-medium">
        {label}
        {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
      </label>
      {children(id)}
    </div>
  );
}
