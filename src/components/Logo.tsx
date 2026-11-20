export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-black tracking-tight">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-400 text-on-brand">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="12" rx="2" /><path d="M10 8.5v3l3-1.5z" fill="currentColor" /><path d="M8 20h8" />
        </svg>
      </span>
      {!compact && <span className="text-lg text-white">Yes<span className="text-brand-400">DOOH</span></span>}
    </span>
  );
}
