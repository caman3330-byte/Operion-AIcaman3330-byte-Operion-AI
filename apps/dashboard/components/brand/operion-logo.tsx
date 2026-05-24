import { cn } from "@/lib/utils";

type OperionBrand = "capital" | "internal";

interface OperionMarkProps {
  className?: string;
}

interface OperionLogoProps {
  brand?: OperionBrand;
  className?: string;
  showTagline?: boolean;
}

export function OperionMark({ className }: OperionMarkProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="Operion Capital mark"
      className={cn("h-9 w-9 shrink-0", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2.5" y="2.5" width="43" height="43" rx="10" fill="#07110F" stroke="url(#operion-mark-stroke)" />
      <path d="M24 8.75 38.25 17v14L24 39.25 9.75 31V17L24 8.75Z" fill="url(#operion-mark-fill)" opacity="0.16" />
      <path d="M24 12.5 34.75 18.7v10.6L24 35.5 13.25 29.3V18.7L24 12.5Z" stroke="#DDE6E2" strokeWidth="2.15" />
      <path d="M24 18.1 29.9 21.5v5L24 29.9l-5.9-3.4v-5L24 18.1Z" fill="#34D399" />
      <path d="M24 12.5v5.6M34.75 18.7 29.9 21.5M18.1 26.5l-4.85 2.8M24 35.5v-5.6" stroke="#34D399" strokeWidth="1.7" strokeLinecap="round" />
      <defs>
        <linearGradient id="operion-mark-stroke" x1="5" y1="4" x2="43" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E5E7EB" stopOpacity="0.42" />
          <stop offset="0.5" stopColor="#34D399" stopOpacity="0.72" />
          <stop offset="1" stopColor="#6B7280" stopOpacity="0.36" />
        </linearGradient>
        <linearGradient id="operion-mark-fill" x1="12" y1="13" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#DDE6E2" />
          <stop offset="1" stopColor="#34D399" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function OperionLogo({ brand = "capital", className, showTagline = true }: OperionLogoProps) {
  const label = brand === "internal" ? "Operion AI" : "Operion Capital";
  const tagline = brand === "internal" ? "Internal operations platform" : "AI-powered business funding";

  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <OperionMark />
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-5 text-white">{label}</span>
        {showTagline ? <span className="block text-xs leading-5 text-muted-foreground">{tagline}</span> : null}
      </span>
    </span>
  );
}
