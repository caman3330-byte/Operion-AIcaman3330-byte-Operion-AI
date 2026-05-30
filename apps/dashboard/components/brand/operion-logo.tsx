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

export function OperionMark({ className }: OperionMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="Operion Capital mark"
      className={cn("h-10 w-10 shrink-0", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="oc-mark-gold" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EDD688" />
          <stop offset="0.30" stopColor="#C9A84C" />
          <stop offset="0.68" stopColor="#9A7825" />
          <stop offset="1" stopColor="#D4AF5A" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="61" height="61" rx="15" fill="#090704" />
      <rect x="1.5" y="1.5" width="61" height="61" rx="15" stroke="url(#oc-mark-gold)" strokeWidth="1.2" opacity="0.75" />
      <text x="9" y="46" fontFamily="Georgia, 'Times New Roman', serif" fontSize="42" fill="url(#oc-mark-gold)" opacity="0.84">O</text>
      <text x="25" y="46" fontFamily="Georgia, 'Times New Roman', serif" fontSize="42" fill="url(#oc-mark-gold)">C</text>
    </svg>
  );
}

const markSizes = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-16 w-16"
};

const wordmarkSizes = {
  sm: "text-[13px] leading-4 tracking-[0.2em]",
  md: "text-[16px] leading-5 tracking-[0.22em]",
  lg: "text-[24px] leading-7 tracking-[0.26em]"
};

const taglineSizes = {
  sm: "text-[9px] leading-4 tracking-[0.22em]",
  md: "text-[11px] leading-5 tracking-[0.26em]",
  lg: "text-[12px] leading-5 tracking-[0.34em]"
};

export function OperionLogo({ className, showTagline = true, size = "md", layout = "horizontal", collapseWordmarkOnMobile = false }: OperionLogoProps) {
  const tagline = "Private Capital Access";

  if (layout === "stacked") {
    return (
      <span className={cn("inline-flex max-w-full min-w-0 flex-col items-center text-center", className)}>
        <OperionMark className={markSizes[size]} />
        <span className={cn("mt-5 block font-sans font-bold uppercase tracking-widest text-white", wordmarkSizes[size])}>Operion</span>
        {showTagline ? (
          <>
            <span className="mt-3 flex w-full max-w-xs items-center justify-center gap-3">
              <span className="h-px w-10 bg-[#C9A84C]/55" />
              <span className={cn("whitespace-nowrap font-sans font-semibold uppercase text-[#C9A84C]", taglineSizes[size])}>Capital</span>
              <span className="h-px w-10 bg-[#C9A84C]/55" />
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
        <span className={cn("block font-sans font-bold uppercase tracking-widest text-white", wordmarkSizes[size])}>Operion Capital</span>
        {showTagline ? <span className={cn("mt-0.5 block font-semibold uppercase text-[#C9A84C]", taglineSizes[size])}>{tagline}</span> : null}
      </span>
    </span>
  );
}
