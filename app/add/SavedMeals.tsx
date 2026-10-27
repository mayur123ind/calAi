"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Check, Clock, DragHandGesture, EditPencil, Flash, Menu, Plus, Search, Star, Trash, Xmark } from "iconoir-react";
import { IconButton, Notice, Segmented } from "@/components/ui";
import { shortDate } from "@/lib/dates";
import { MEAL_TYPES, fmt, sumItems, type FoodItem, type MealType } from "@/lib/nutrition";

type Favorite = { id: number; name: string; meal_type: MealType; items: FoodItem[] };
type Recent = { meal_type: MealType; items: FoodItem[]; photo: string | null; last_day: string; times: number };
type Tab = "recent" | "frequent" | "favorites";

const mealLabel = (t: MealType) => MEAL_TYPES.find((m) => m.id === t)?.label ?? t;
const names = (items: FoodItem[]) => items.map((i) => i.name).join(", ");

export function SavedMeals({ onPick }: { onPick: (items: FoodItem[], type: MealType) => void }) {
  const [data, setData] = useState<{ favorites: Favorite[]; recent: Recent[]; frequent: Recent[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("recent");
  const [query, setQuery] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null); // the row whose swipe actions are showing

  useEffect(() => {
    fetch("/api/meals/recent", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setData(d);
        if (d.favorites.length && !d.recent.length) setTab("favorites");
      })
      .catch(() => setError("Couldn't load your saved meals. Refresh to try again."));
  }, []);

  async function send(url: string, init: RequestInit) {
    setError(null);
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } }).catch(() => null);
    if (!res?.ok) {
      setError("Couldn't save that change. Try again.");
      return;
    }
    const { favorites } = await res.json();
    setData((d) => (d ? { ...d, favorites } : d));
  }

  function pick(key: string, items: FoodItem[], type: MealType) {
    onPick(items, type);
    setAdded(key);
    setOpen(null);
  }

  if (error && !data) return <Notice tone="error">{error}</Notice>;
  if (!data) return <div className="h-48 animate-pulse rounded-3xl bg-surface-2" aria-hidden="true" />;

  const q = query.trim().toLowerCase();
  const match = (text: string) => !q || text.toLowerCase().includes(q);

  return (
    <div className="space-y-3">
      <Segmented
        label="Saved meals"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setOpen(null);
        }}
        options={[
          { value: "recent", label: <><Clock className="hidden size-4 sm:block" /> Recents</> },
          { value: "frequent", label: <><Flash className="hidden size-4 sm:block" /> Frequent</> },
          { value: "favorites", label: <><Star className="hidden size-4 sm:block" /> Favourites</> },
        ]}
      />
      <label className="flex h-11 items-center gap-2 rounded-2xl border border-line bg-surface/90 px-3 focus-within:border-leaf">
        <Search className="size-5 text-muted" />
        <span className="sr-only">Search saved meals</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search foods"
          className="h-full min-w-0 flex-1 bg-transparent text-base focus:outline-none"
        />
        {query && (
          <IconButton label="Clear search" onClick={() => setQuery("")} className="size-8">
            <Xmark className="size-4" />
          </IconButton>
        )}
      </label>
      {error && <Notice tone="error">{error}</Notice>}

      {tab === "favorites" ? (
        <FavoriteList
          favorites={data.favorites.filter((f) => match(`${f.name} ${names(f.items)}`))}
          reorderable={!q}
          added={added}
          open={open}
          setOpen={setOpen}
          onPick={pick}
          onRename={(id, name) => send(`/api/favorites/${id}`, { method: "PATCH", body: JSON.stringify({ name }) })}
          onRemove={(id) => send(`/api/favorites/${id}`, { method: "DELETE" })}
          onReorder={(ids) => {
            setData((d) => (d ? { ...d, favorites: ids.map((id) => d.favorites.find((f) => f.id === id)!) } : d));
            void send("/api/favorites/order", { method: "PUT", body: JSON.stringify({ ids }) });
          }}
        />
      ) : (
        <MealRows
          list={(tab === "recent" ? data.recent : data.frequent).filter((r) => match(names(r.items)))}
          empty={
            tab === "recent"
              ? "Meals you log show up here so you can add them again in one tap."
              : "Meals you've eaten at least twice show up here, most often first."
          }
          sub={(r) => (tab === "frequent" ? `${r.times}× · ${mealLabel(r.meal_type)}` : `${mealLabel(r.meal_type)} · ${shortDate(r.last_day)}`)}
          added={added}
          prefix={tab}
          onPick={pick}
        />
      )}
    </div>
  );
}

function MealRows({
  list,
  empty,
  sub,
  added,
  prefix,
  onPick,
}: {
  list: Recent[];
  empty: string;
  sub: (r: Recent) => string;
  added: string | null;
  prefix: string;
  onPick: (key: string, items: FoodItem[], type: MealType) => void;
}) {
  if (list.length === 0) return <EmptyNote>{empty}</EmptyNote>;
  return (
    <ul className="divide-y divide-line overflow-hidden card shadow-sm">
      {list.map((r, i) => {
        const key = `${prefix}${i}`;
        return (
          <li key={key}>
            <AddRow title={names(r.items)} sub={sub(r)} kcal={sumItems(r.items).calories} added={added === key} onAdd={() => onPick(key, r.items, r.meal_type)} />
          </li>
        );
      })}
    </ul>
  );
}

function FavoriteList({
  favorites,
  reorderable,
  added,
  open,
  setOpen,
  onPick,
  onRename,
  onRemove,
  onReorder,
}: {
  favorites: Favorite[];
  reorderable: boolean;
  added: string | null;
  open: string | null;
  setOpen: (k: string | null) => void;
  onPick: (key: string, items: FoodItem[], type: MealType) => void;
  onRename: (id: number, name: string) => void;
  onRemove: (id: number) => void;
  onReorder: (ids: number[]) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<{ id: number; order: number[] } | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);

  if (favorites.length === 0) {
    return <EmptyNote>Star a meal on the Today screen to keep it here. Drag the handle to put your favourites in order.</EmptyNote>;
  }

  const order = drag?.order ?? favorites.map((f) => f.id);
  const byId = new Map(favorites.map((f) => [f.id, f]));

  // Drag-to-reorder with pointer events, so it works with a finger as well as a mouse.
  function startDrag(e: ReactPointerEvent, id: number) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setOpen(null);
    setDrag({ id, order: favorites.map((f) => f.id) });
  }
  function moveDrag(e: ReactPointerEvent) {
    if (!drag || !listRef.current) return;
    const rows = [...listRef.current.children] as HTMLElement[];
    const over = rows.findIndex((r) => {
      const b = r.getBoundingClientRect();
      return e.clientY >= b.top && e.clientY < b.bottom;
    });
    if (over < 0) return;
    const from = drag.order.indexOf(drag.id);
    if (over === from) return;
    const next = drag.order.filter((x) => x !== drag.id);
    next.splice(over, 0, drag.id);
    setDrag({ ...drag, order: next });
  }
  function endDrag() {
    if (!drag) return;
    const changed = drag.order.some((id, i) => favorites[i]?.id !== id);
    setDrag(null);
    if (changed) onReorder(drag.order);
  }

  return (
    <ul ref={listRef} className="divide-y divide-line overflow-hidden card shadow-sm">
      {order.map((id) => {
        const f = byId.get(id)!;
        const key = `f${id}`;
        if (renaming?.id === id) {
          return (
            <li key={key} className="flex items-center gap-2 px-3 py-2.5">
              <input
                autoFocus
                aria-label="Favourite name"
                value={renaming.name}
                maxLength={80}
                onChange={(e) => setRenaming({ id, name: e.target.value })}
                className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 focus:border-leaf focus:outline-none"
              />
              <IconButton label="Save name" onClick={() => { if (renaming.name.trim()) onRename(id, renaming.name.trim()); setRenaming(null); }} className="size-10 bg-leaf text-on-leaf hover:bg-leaf hover:text-on-leaf">
                <Check className="size-5" />
              </IconButton>
              <IconButton label="Cancel" onClick={() => setRenaming(null)} className="size-10">
                <Xmark className="size-5" />
              </IconButton>
            </li>
          );
        }
        return (
          <li key={key} className={drag?.id === id ? "relative z-10 bg-surface shadow-md" : ""}>
            <SwipeRow
              open={open === key}
              onOpen={(o) => {
                setOpen(o ? key : null);
                setConfirm(null);
              }}
              actions={
                confirm === id ? (
                  <button type="button" onClick={() => onRemove(id)} className="flex h-full w-36 items-center justify-center gap-1.5 bg-danger text-sm font-semibold text-white">
                    <Trash className="size-4" /> Remove
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => setRenaming({ id, name: f.name })} className="flex h-full w-[72px] flex-col items-center justify-center gap-0.5 bg-surface-2 text-xs font-medium">
                      <EditPencil className="size-4" /> Rename
                    </button>
                    {/* Removing needs a second tap, so a stray swipe can't delete anything. */}
                    <button type="button" onClick={() => setConfirm(id)} className="flex h-full w-[72px] flex-col items-center justify-center gap-0.5 bg-danger-soft text-xs font-medium text-danger">
                      <Trash className="size-4" /> Remove
                    </button>
                  </>
                )
              }
            >
              <div className="flex items-center">
                {reorderable && (
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Drag to reorder ${f.name}`}
                    onPointerDown={(e) => startDrag(e, id)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    className="flex h-14 w-9 shrink-0 cursor-grab touch-none items-center justify-center text-muted active:cursor-grabbing"
                  >
                    <Menu className="size-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <AddRow title={f.name} sub={names(f.items)} kcal={sumItems(f.items).calories} added={added === key} onAdd={() => onPick(key, f.items, f.meal_type)} />
                </div>
              </div>
            </SwipeRow>
          </li>
        );
      })}
      <li className="flex items-center gap-1.5 px-4 py-2 text-xs text-muted">
        <DragHandGesture className="size-4" /> Swipe left for more; drag the handle to reorder.
      </li>
    </ul>
  );
}

/** A row that slides left to show its actions. Nothing happens until an action is tapped. */
function SwipeRow({ open, onOpen, actions, children }: { open: boolean; onOpen: (o: boolean) => void; actions: ReactNode; children: ReactNode }) {
  const [dx, setDx] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const WIDTH = 144;

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex" style={{ width: WIDTH }}>
        {actions}
      </div>
      <div
        className={`relative bg-surface ${dx === null ? "transition-transform duration-300 ease-out-expo" : ""}`}
        style={{ transform: `translateX(${dx ?? (open ? -WIDTH : 0)}px)`, touchAction: "pan-y" }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          start.current = { x: e.clientX, y: e.clientY, moved: false };
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const x = e.clientX - s.x;
          if (!s.moved && (Math.abs(x) < 8 || Math.abs(e.clientY - s.y) > Math.abs(x))) return;
          s.moved = true;
          setDx(Math.max(-WIDTH - 24, Math.min(0, (open ? -WIDTH : 0) + x)));
        }}
        onPointerUp={() => {
          if (start.current?.moved && dx !== null) onOpen(dx < -WIDTH / 2);
          start.current = null;
          setDx(null);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDx(null);
        }}
        onClickCapture={(e) => {
          // A swipe isn't a tap; and tapping an open row closes it rather than adding the meal.
          if (open) {
            e.stopPropagation();
            onOpen(false);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

function AddRow({ title, sub, kcal, added, onAdd }: { title: string; sub: string; kcal: number; added: boolean; onAdd: () => void }) {
  return (
    <button type="button" onClick={onAdd} className="flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left sm:px-4">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{title}</span>
        <span className="block truncate text-sm text-muted">{sub}</span>
      </span>
      <span className="num shrink-0 text-sm font-semibold">{fmt(kcal)} kcal</span>
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${added ? "bg-leaf text-on-leaf" : "bg-leaf-soft text-leaf"}`}>
        {added ? <Check className="size-4" /> : <Plus className="size-4" />}
      </span>
    </button>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[15px] text-muted">{children}</p>;
}
