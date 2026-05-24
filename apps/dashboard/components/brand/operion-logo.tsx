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
}

export function OperionMark({ className, tone = "dark" }: OperionMarkProps) {
  const fill = tone === "light" ? "#F8F5EE" : "#050505";
  const edge = tone === "light" ? "#B9974B" : "#D7B76A";

  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="Operion Capital mark"
      className={cn("h-10 w-10 shrink-0", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="3" y="3" width="58" height="58" rx="14" fill={fill} stroke={edge} strokeWidth="1.25" />
      <circle cx="27.5" cy="31.5" r="15.75" stroke="url(#operion-gold-stroke)" strokeWidth="4.6" />
      <path d="M34 18.2c8.2 0 14.8 5.9 16.2 13.6M50.2 31.8c-1.4 7.7-8 13.6-16.2 13.6" stroke="url(#operion-gold-stroke)" strokeWidth="4.6" strokeLinecap="round" />
      <path d="M32 16.75v30.5" stroke="#F6E6B8" strokeWidth="1.25" strokeLinecap="round" opacity="0.72" />
      <path d="M21.5 43.5 43.8 20.9" stroke="#F6E6B8" strokeWidth="1.05" strokeLinecap="round" opacity="0.45" />
      <defs>
        <linearGradient id="operion-gold-stroke" x1="15" y1="14" x2="49" y2="49" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF0B8" />
          <stop offset="0.35" stopColor="#D7B76A" />
          <stop offset="0.72" stopColor="#A78335" />
          <stop offset="1" stopColor="#F7E6B3" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function OperionLogo({ brand = "capital", className, showTagline = true }: OperionLogoProps) {
  const label = brand === "internal" ? "Operion AI" : "Operion Capital";
  const tagline = brand === "internal" ? "Private operations command" : "Private capital access";

  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <OperionMark />
      <span className="min-w-0">
        <span className="block font-serif text-[15px] font-semibold uppercase leading-5 tracking-[0.22em] text-white">{label}</span>
        {showTagline ? <span className="block text-[11px] uppercase leading-5 tracking-[0.22em] text-[#d7b76a]">{tagline}</span> : null}
      </span>
    </span>
  );
}
