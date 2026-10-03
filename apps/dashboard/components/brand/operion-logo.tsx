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
  tone?: "dark" | "light";
}

export function OperionMark({ className, tone = "light" }: OperionMarkProps) {
  const isDark = tone === "dark";
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
        <linearGradient id="oc-mark-blue" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0F2F57" />
          <stop offset="0.42" stopColor="#0E7BD3" />
          <stop offset="1" stopColor="#20D3EE" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="16" fill={isDark ? "#071B33" : "#FFFFFF"} />
      <rect x="1" y="1" width="62" height="62" rx="16" stroke="url(#oc-mark-blue)" strokeWidth="1.2" opacity="0.76" />
      <text x="7" y="47" fontFamily="Georgia, 'Times New Roman', serif" fontSize="44" fontWeight="bold" fontStyle="italic" fill="url(#oc-mark-blue)" opacity="0.82">O</text>
      <text x="22" y="47" fontFamily="Georgia, 'Times New Roman', serif" fontSize="44" fontWeight="bold" fontStyle="italic" fill="url(#oc-mark-blue)">C</text>
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

export function OperionLogo({ className, showTagline = true, size = "md", layout = "horizontal", collapseWordmarkOnMobile = false, tone = "dark" }: OperionLogoProps) {
  const tagline = "Intelligent Capital Operations";
  const wordmarkClass = tone === "light" ? "text-[#071b33]" : "text-white";
  const taglineClass = tone === "light" ? "text-sky-700" : "text-cyan-300";
  const mutedClass = tone === "light" ? "text-slate-500" : "text-muted-foreground";
  const dividerClass = tone === "light" ? "bg-sky-300" : "bg-cyan-300/55";

  if (layout === "stacked") {
    return (
      <span className={cn("inline-flex max-w-full min-w-0 flex-col items-center text-center", className)}>
        <OperionMark className={markSizes[size]} tone={tone} />
        <span className={cn("mt-5 block font-sans font-bold uppercase tracking-widest", wordmarkClass, wordmarkSizes[size])}>Operion</span>
        {showTagline ? (
          <>
            <span className="mt-3 flex w-full max-w-xs items-center justify-center gap-3">
              <span className={cn("h-px w-10", dividerClass)} />
              <span className={cn("whitespace-nowrap font-sans font-semibold uppercase", taglineClass, taglineSizes[size])}>Capital</span>
              <span className={cn("h-px w-10", dividerClass)} />
            </span>
            <span className={cn("mt-4 text-[10px] font-semibold uppercase leading-5 tracking-[0.28em]", mutedClass)}>{tagline}</span>
          </>
        ) : null}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-4", className)}>
      <OperionMark className={markSizes[size]} tone={tone} />
      <span className={cn("min-w-0 whitespace-nowrap", collapseWordmarkOnMobile && "hidden sm:block")}>
        <span className={cn("block font-sans font-bold uppercase tracking-widest", wordmarkClass, wordmarkSizes[size])}>Operion Capital</span>
        {showTagline ? <span className={cn("mt-0.5 block font-semibold uppercase", taglineClass, taglineSizes[size])}>{tagline}</span> : null}
      </span>
    </span>
  );
}
