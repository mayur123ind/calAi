export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0f3d2c" />
          <stop offset="100%" stopColor="#06150e" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#logo-bg)" />
      <circle cx="32" cy="32" r="19" fill="none" stroke="#a3e635" strokeWidth="3" opacity="0.22" />
      <circle
        cx="32"
        cy="32"
        r="19"
        fill="none"
        stroke="#a3e635"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="84 120"
        transform="rotate(-90 32 32)"
        className="[animation:logo-draw_1.4s_var(--ease-out)_both]"
      />
      <circle cx="32" cy="32" r="6" fill="#fbbf24" className="origin-center [animation:pop_700ms_var(--ease-spring)_400ms_both] [transform-box:fill-box]" />
    </svg>
  );
}
