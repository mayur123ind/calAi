import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

export const btn = {
  primary:
    "sheen inline-flex h-12 items-center justify-center gap-2 rounded-full bg-leaf px-6 font-semibold text-on-leaf shadow-glow transition-[background-color,transform,box-shadow] duration-300 ease-out-expo hover:-translate-y-0.5 hover:bg-leaf-strong active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
  secondary:
    "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-line bg-surface/80 px-6 font-medium text-ink backdrop-blur transition-[background-color,transform,border-color] duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-ink/25 hover:bg-surface active:translate-y-0 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
  ghost:
    "inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted transition-colors duration-200 hover:bg-surface-2 hover:text-ink",
};

export const input =
  "h-12 w-full rounded-2xl border border-line bg-surface/90 px-4 text-base text-ink placeholder:text-muted/70 transition-[border-color,box-shadow] duration-200 focus:border-leaf focus:outline-none focus:ring-4 focus:ring-leaf/15";

/** Splits a string title into words that each slide up out of a mask. */
export function MaskedText({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  if (typeof children !== "string") return <>{children}</>;
  return (
    <>
      {children.split(" ").map((word, i, all) => (
        <span key={i} className="mask-line">
          <span style={{ "--i": i + delay } as CSSProperties}>
            {word}
            {i < all.length - 1 ? " " : ""}
          </span>
        </span>
      ))}
    </>
  );
}

export function PageHeader({
  title,
  sub,
  action,
  eyebrow,
}: {
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-4 pb-6 pt-[max(1.5rem,env(safe-area-inset-top))] lg:pb-8 lg:pt-12">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2 animate-rise">{eyebrow}</p>}
        <h1 className="font-display text-[40px] font-bold leading-[0.95] tracking-[-0.04em] sm:text-5xl lg:text-[64px]">
          <MaskedText>{title}</MaskedText>
        </h1>
        {sub && <p className="mt-3 max-w-xl animate-rise text-[15px] text-muted [animation-delay:200ms]">{sub}</p>}
      </div>
      {action && <div className="animate-rise [animation-delay:150ms]">{action}</div>}
    </header>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <div role="radiogroup" aria-label={label} className="relative flex rounded-full border border-line/70 bg-surface-2/80 p-1">
      {/* One pill that slides to the chosen option. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-full bg-surface shadow-md transition-transform duration-500 ease-spring"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`relative flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2 text-sm font-medium transition-colors duration-300 ${
              active ? "text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Spinner({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`spinner ${className}`} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`animate-rise rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
        tone === "error" ? "border-danger/25 bg-danger-soft text-danger" : "border-leaf/20 bg-leaf-soft text-leaf-strong"
      }`}
    >
      {children}
    </div>
  );
}

export function IconButton({ label, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-muted transition-[background-color,color,transform] duration-200 hover:bg-surface-2 hover:text-ink active:scale-90 disabled:pointer-events-none disabled:opacity-35 ${className}`}
      {...props}
    />
  );
}
