import { cn } from "@/lib/utils";

type OperionBrand = "capital" | "internal";

interface OperionMarkProps {
  className?: string;
  tone?: "dark" | "light";
}

interface OperionLogoProps {
  brand?: OperionBrand;
  className?: string;
  showTagline?: boolean;
  size?: "sm" | "md" | "lg";
  layout?: "horizontal" | "stacked";
  collapseWordmarkOnMobile?: boolean;
}

export function OperionMark({ className, tone = "dark" }: OperionMarkProps) {
  const fill = tone === "light" ? "#F7F1E6" : "#030303";
  const edge = tone === "light" ? "#A9822F" : "#DAB96B";

  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="Operion Capital mark"
      className={cn("h-10 w-10 shrink-0", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="4" y="4" width="56" height="56" rx="14" fill={fill} stroke={edge} strokeWidth="1.05" />
      <rect x="7.5" y="7.5" width="49" height="49" rx="11.5" stroke="url(#operion-mark-frame)" strokeWidth="0.7" opacity="0.58" />
      <circle cx="26.25" cy="32" r="14.1" stroke="url(#operion-gold-stroke)" strokeWidth="4.2" />
      <path
        d="M40.2 18.3c7.1 1.1 12.55 6.85 13.25 13.9M53.45 32.2c-.72 7.02-6.18 12.76-13.25 13.86"
        stroke="url(#operion-gold-stroke)"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <path d="M35.7 18.9c-3.9 3.45-6.35 8.12-6.35 13.1 0 5.02 2.45 9.67 6.35 13.1" stroke="#F7E7B7" strokeWidth="1.15" strokeLinecap="round" opacity="0.62" />
      <defs>
        <linearGradient id="operion-gold-stroke" x1="12" y1="14" x2="54" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF4BF" />
          <stop offset="0.28" stopColor="#E4C56F" />
          <stop offset="0.58" stopColor="#A77D2E" />
          <stop offset="0.82" stopColor="#D9B764" />
          <stop offset="1" stopColor="#FFF0BC" />
        </linearGradient>
        <linearGradient id="operion-mark-frame" x1="12" y1="9" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F8E7AF" />
          <stop offset="0.55" stopColor="#7B6028" />
          <stop offset="1" stopColor="#E6C570" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const markSizes = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-16 w-16"
};

const wordmarkSizes = {
  sm: "text-[13px] leading-4 tracking-[0.18em]",
  md: "text-[16px] leading-5 tracking-[0.2em]",
  lg: "text-[24px] leading-7 tracking-[0.24em]"
};

const taglineSizes = {
  sm: "text-[9px] leading-4 tracking-[0.2em]",
  md: "text-[11px] leading-5 tracking-[0.24em]",
  lg: "text-[12px] leading-5 tracking-[0.34em]"
};

export function OperionLogo({ className, showTagline = true, size = "md", layout = "horizontal", collapseWordmarkOnMobile = false }: OperionLogoProps) {
  const label = "Operion Capital";
  const tagline = "Private Capital Access";

  if (layout === "stacked") {
    return (
      <span className={cn("inline-flex max-w-full min-w-0 flex-col items-center text-center", className)}>
        <OperionMark className={markSizes[size]} />
        <span className={cn("mt-5 block font-serif font-medium uppercase text-white", wordmarkSizes[size])}>Operion</span>
        {showTagline ? (
          <>
            <span className="mt-3 flex w-full max-w-xs items-center justify-center gap-3">
              <span className="h-px w-10 bg-primary/55" />
              <span className={cn("whitespace-nowrap uppercase text-[#d7b76a]", taglineSizes[size])}>Capital</span>
              <span className="h-px w-10 bg-primary/55" />
            </span>
            <span className="mt-4 text-[10px] font-semibold uppercase leading-5 tracking-[0.28em] text-muted-foreground">{tagline}</span>
          </>
        ) : null}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-4", className)}>
      <OperionMark className={markSizes[size]} />
      <span className={cn("min-w-0 whitespace-nowrap", collapseWordmarkOnMobile && "hidden sm:block")}>
        <span className={cn("block font-serif font-medium uppercase text-white", wordmarkSizes[size])}>{label}</span>
        {showTagline ? <span className={cn("mt-0.5 block uppercase text-[#d7b76a]", taglineSizes[size])}>{tagline}</span> : null}
      </span>
    </span>
  );
}
