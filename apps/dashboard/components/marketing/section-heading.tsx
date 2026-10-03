import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  className
}: {
  eyebrow: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("max-w-3xl", className)}>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">{eyebrow}</p>
      <h2 className="mt-4 font-serif text-3xl font-medium leading-tight tracking-normal text-slate-950 sm:text-4xl">{title}</h2>
      {description ? <p className="mt-5 text-base leading-8 text-slate-600">{description}</p> : null}
    </div>
  );
}
