"use client";

import Link from "next/link";
import Image from "next/image";
import type { MotionStyle } from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  ShieldCheck,
  Sparkles,
  Workflow
} from "lucide-react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { OperionLogo } from "@/components/brand/operion-logo";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "operion-scroll-cinematic-seen-v1";

const documents = [
  { label: "Business Information", x: "-13rem", y: "-8.5rem", rotate: -9, pathX: "-5rem", pathY: "-1.8rem", arcX: "-8rem", arcY: "-5rem" },
  { label: "Bank Statement", x: "9.2rem", y: "-9rem", rotate: 8, pathX: "3.2rem", pathY: "-2.7rem", arcX: "7rem", arcY: "-5.4rem" },
  { label: "Financial Documents", x: "-14rem", y: "3rem", rotate: 7, pathX: "-5.2rem", pathY: "2.3rem", arcX: "-9rem", arcY: "0.8rem" },
  { label: "Revenue Profile", x: "11rem", y: "3.2rem", rotate: -7, pathX: "4.4rem", pathY: "2.6rem", arcX: "8.4rem", arcY: "1.3rem" },
  { label: "Contact Details", x: "-1.2rem", y: "10rem", rotate: 4, pathX: "0rem", pathY: "4.2rem", arcX: "-1.8rem", arcY: "6.8rem" }
];

const workers = [
  ["Acquisition Manager", "Routes intake work", "left-[4%] top-[21%]", -8, 0.86],
  ["Document Worker", "Extracts and verifies", "right-[7%] top-[15%]", 7, 0.94],
  ["Analysis AI", "Understands the business", "left-[10%] bottom-[18%]", 5, 0.9],
  ["Qualification AI", "Assesses fit", "left-[42%] bottom-[7%]", -4, 1],
  ["Lender Match AI", "Finds suitable partners", "right-[7%] bottom-[20%]", 8, 0.88]
] as const;

const lenders = [
  ["Lender A", "Not the right fit", "left-[5%] top-[22%]", "reject"],
  ["Lender B", "Not the right fit", "left-[10%] bottom-[24%]", "reject"],
  ["Lender C", "Reviewing", "left-[35%] bottom-[10%]", "review"],
  ["Lender D", "Potential match", "right-[8%] top-[20%]", "match"],
  ["Lender E", "Potential match", "right-[7%] bottom-[22%]", "match"]
] as const;

export function CinematicScrollHero() {
  const reduceMotion = useReducedMotion();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [skipIntro, setSkipIntro] = useState(false);
  const introMarkedRef = useRef(false);
  const persistenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const shouldReduceMotion = Boolean(reduceMotion || prefersReducedMotion);
  const { scrollYProgress } = useScroll();
  const cinematicProgress = useTransform(scrollYProgress, [0, 0.7], [0, 1]);
  // Drive scene transforms directly from scroll so the cinematic never trails the user's finger or wheel.
  const progress = cinematicProgress;
  const scrollHintOpacity = useTransform(progress, [0, 0.92, 1], [1, 1, 0]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(media.matches);

    function handleMotionPreference(event: MediaQueryListEvent) {
      setPrefersReducedMotion(event.matches);
    }

    media.addEventListener("change", handleMotionPreference);
    return () => media.removeEventListener("change", handleMotionPreference);
  }, []);

  useEffect(() => {
    if (shouldReduceMotion) return;
    try {
      setSkipIntro(window.sessionStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      setSkipIntro(false);
    }
  }, [shouldReduceMotion]);

  useEffect(() => {
    if (skipIntro) window.scrollTo({ top: 0, behavior: "instant" });
  }, [skipIntro]);

  useEffect(() => () => {
    if (persistenceTimerRef.current !== null) clearTimeout(persistenceTimerRef.current);
  }, []);

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    if (latest < 0.64 || introMarkedRef.current) return;
    introMarkedRef.current = true;
    persistenceTimerRef.current = setTimeout(() => {
      persistenceTimerRef.current = null;
      try {
        window.sessionStorage.setItem(STORAGE_KEY, "true");
      } catch {
        // Session persistence is optional when browser storage is unavailable.
      }
    }, 0);
  });

  function skip() {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Non-critical.
    }
    setSkipIntro(true);
  }

  if (shouldReduceMotion || skipIntro) {
    return <StaticHero />;
  }

  return (
    <section ref={sectionRef} className="cinematic-journey relative min-h-[540vh] bg-[#f7fbf7]" aria-label="Operion Capital application journey">
      <div className="sticky top-20 z-10 h-[calc(100vh-5rem)] min-h-[620px] overflow-hidden">
        <CinematicBackground progress={progress} />
        <motion.button
          type="button"
          onClick={skip}
          className="absolute right-4 top-4 z-30 rounded-full border border-white/70 bg-white/82 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:border-emerald-300 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 sm:right-6 sm:top-6"
          style={{ opacity: scrollHintOpacity }}
        >
          Skip intro
        </motion.button>
        <motion.div className="absolute left-4 top-4 z-30 hidden items-center gap-2 rounded-full border border-white/70 bg-white/82 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 shadow-sm backdrop-blur sm:left-6 sm:top-6 sm:flex" style={{ opacity: scrollHintOpacity }}>
          <ArrowDown className="h-4 w-4 text-emerald-700" />
          Scroll the journey
        </motion.div>
        <div className="relative mx-auto grid h-full max-w-7xl items-center gap-8 px-4 sm:px-6 lg:grid-cols-[0.76fr_1.24fr] lg:px-8">
          <CinematicCopy progress={progress} />
          <CinematicStage progress={progress} />
        </div>
      </div>
    </section>
  );
}

function CinematicCopy({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const merchantOpacity = useTransform(progress, [0, 0.08, 0.13], [1, 1, 0]);
  const applicationOpacity = useTransform(progress, [0.11, 0.18, 0.31, 0.37], [0, 1, 1, 0]);
  const operionOpacity = useTransform(progress, [0.36, 0.43, 0.58, 0.64], [0, 1, 1, 0]);
  const matchOpacity = useTransform(progress, [0.58, 0.66, 0.79, 0.85], [0, 1, 1, 0]);
  const returnOpacity = useTransform(progress, [0.76, 0.82, 0.9], [0, 1, 0]);
  const finalOpacity = useTransform(progress, [0.88, 0.96, 1], [0, 1, 1]);
  const y = useTransform(progress, [0, 1], [18, -16]);
  const finalY = useTransform(progress, [0.78, 1], [28, 0]);

  return (
    <div className="cinematic-copy relative z-20 min-h-[460px] pt-10 lg:min-h-[560px] lg:pt-0">
      <motion.div className="absolute inset-x-0 top-4 lg:top-12" style={{ opacity: merchantOpacity, y }}>
        <OperionLogo size="lg" layout="stacked" tone="light" className="items-start text-left" />
        <h1 className="mt-4 max-w-2xl text-5xl font-semibold leading-[1.02] tracking-[-0.035em] text-[#071b33] sm:text-6xl lg:text-7xl">
          Your business has a bigger tomorrow.
        </h1>
        <p className="mt-6 max-w-lg text-lg leading-8 text-slate-600">
          A business owner arrives with a real financing need. Operion turns that need into an organized path forward.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold text-slate-600">
          {["People", "Opportunity", "A stronger tomorrow"].map((item) => (
            <span key={item} className="rounded-full border border-white/70 bg-white/72 px-4 py-2 shadow-sm backdrop-blur">
              {item}
            </span>
          ))}
        </div>
      </motion.div>

      <SceneText style={{ opacity: applicationOpacity }} title="A simple application gets you started." text="Secure business information, statements, financials, and contact details move into one clean intake." />
      <SceneText style={{ opacity: operionOpacity }} title="Your information enters Operion." text="The system organizes documents, activates workers, checks completeness, and prepares the opportunity for review." />
      <SceneText style={{ opacity: matchOpacity }} title="The business is matched to the right lending partners." text="Operion compares fit, rejects weak paths, and surfaces the clearest next step when the file supports it." />
      <SceneText style={{ opacity: returnOpacity }} title="The result goes back to you." text="A clear next step returns to the merchant without implying guaranteed approval or automatic lender action." />

      <motion.div className="absolute inset-x-0 top-4 lg:top-12" style={{ opacity: finalOpacity, y: finalY }}>
        <h2 className="mt-4 max-w-2xl text-5xl font-semibold leading-[1.02] tracking-[-0.035em] text-[#071b33] sm:text-6xl">
          Intelligent capital operations for growing businesses.
        </h2>
        <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
          Explore financing options for your business, start an application, or speak with the Operion team.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="bg-[#124f40] text-white shadow-lg shadow-emerald-900/20 hover:bg-[#0d3f34]">
            <Link href="/apply">
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-slate-200 bg-white/75 text-slate-800 hover:bg-white">
            <Link href="/business-funding">Learn more</Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function SceneText({
  title,
  text,
  style
}: {
  title: string;
  text: string;
  style: MotionStyle;
}) {
  return (
    <motion.div className="absolute inset-x-0 top-4 lg:top-12" style={style}>
      <h2 className="mt-4 max-w-2xl text-4xl font-semibold leading-[1.04] tracking-[-0.035em] text-[#071b33] sm:text-6xl">
        {title}
      </h2>
      <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">{text}</p>
    </motion.div>
  );
}

function CinematicStage({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const stageScale = useTransform(progress, [0, 0.18, 0.35, 0.52, 0.67, 0.82, 1], [0.92, 1.02, 1.13, 1.03, 0.82, 1.03, 0.98]);
  const stageX = useTransform(progress, [0, 0.18, 0.38, 0.58, 0.72, 0.9, 1], [20, 0, -30, -10, 24, -12, 0]);
  const stageRotateX = useTransform(progress, [0, 0.26, 0.58, 0.82, 1], [0, 2.2, -2.4, 1.4, 0]);
  const stageRotateY = useTransform(progress, [0, 0.2, 0.5, 0.75, 1], [-2, 0.8, -1.8, 2.6, 0]);
  const buildingOpacity = useTransform(progress, [0, 0.18, 0.3, 0.78, 0.88, 0.94], [1, 1, 0.24, 0.08, 0.78, 0]);
  const applicationOpacity = useTransform(progress, [0.08, 0.17, 0.34, 0.43], [0, 1, 1, 0]);
  const coreOpacity = useTransform(progress, [0.32, 0.42, 0.84, 0.91], [0, 1, 1, 0]);
  const workerOpacity = useTransform(progress, [0.44, 0.53, 0.72], [0, 1, 1]);
  const lenderOpacity = useTransform(progress, [0.58, 0.67, 0.84], [0, 1, 1]);
  const resultOpacity = useTransform(progress, [0.68, 0.76, 0.84], [0, 1, 0]);
  const returnOpacity = useTransform(progress, [0.78, 0.86, 0.94], [0, 1, 0]);
  const websiteOpacity = useTransform(progress, [0.88, 0.97, 1], [0, 1, 1]);
  const ownerY = useTransform(progress, [0, 0.18, 0.28], [0, -8, -16]);
  const ownerScale = useTransform(progress, [0, 0.2, 0.28], [1.06, 1.18, 1.32]);
  const deskOpacity = useTransform(progress, [0.04, 0.14, 0.34, 0.45], [0, 1, 1, 0]);
  const applicationY = useTransform(progress, [0.08, 0.21, 0.38], [66, -2, -86]);
  const applicationScale = useTransform(progress, [0.08, 0.24, 0.38], [0.66, 1.04, 1.32]);
  const applicationRotateX = useTransform(progress, [0.08, 0.22, 0.38], [16, 0, -4]);
  const coreScale = useTransform(progress, [0.36, 0.5, 0.64, 0.78], [0.82, 1.08, 0.82, 1]);
  const coreLabelOpacity = useTransform(progress, [0.38, 0.46], [0, 1]);
  const resultScale = useTransform(progress, [0.69, 0.78], [0.9, 1]);
  const returnScale = useTransform(progress, [0.78, 0.86, 0.94], [0.78, 1, 1.08]);
  const returnX = useTransform(progress, [0.78, 0.86, 0.94], [90, 0, -40]);
  const websiteY = useTransform(progress, [0.88, 0.98], [72, 0]);
  const websiteScale = useTransform(progress, [0.88, 0.98], [0.9, 1]);
  const vignetteOpacity = useTransform(progress, [0, 0.24, 0.64, 1], [0.12, 0.22, 0.1, 0]);

  return (
    <motion.div className="cinematic-stage relative z-10 min-h-[520px] [perspective:1400px] lg:min-h-[650px]" style={{ scale: stageScale, x: stageX, rotateX: stageRotateX, rotateY: stageRotateY }}>
      <motion.div className="camera-vignette pointer-events-none absolute -inset-10 z-40" style={{ opacity: vignetteOpacity }} />
      <motion.div className="absolute inset-0 overflow-hidden rounded-[2rem] border border-white/70 bg-white/55 shadow-2xl shadow-emerald-950/10 backdrop-blur-xl" style={{ opacity: buildingOpacity }}>
        <motion.div className="absolute inset-0" style={{ scale: ownerScale, y: ownerY }}>
          <Image src="/merchant-journey-opening.webp" alt="Business owner approaching a laptop in a bright glass office" fill priority sizes="(max-width: 767px) 100vw, 60vw" className="object-cover object-[45%_center]" />
        </motion.div>
        <motion.div className="office-desk-rig absolute bottom-0 right-[8%] hidden h-[34%] w-[48%] md:block" style={{ opacity: deskOpacity }} />
      </motion.div>

      <motion.div className="absolute inset-0 flex items-center justify-center [transform-style:preserve-3d]" style={{ opacity: applicationOpacity, y: applicationY, scale: applicationScale, rotateX: applicationRotateX }}>
        <ApplicationPanel progress={progress} />
      </motion.div>

      <motion.div className="absolute inset-0 overflow-hidden rounded-[2rem] border border-white/70 bg-white/62 shadow-2xl shadow-emerald-950/10 backdrop-blur-xl" style={{ opacity: coreOpacity }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(18,79,64,0.16),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.85),rgba(236,248,242,0.68))]" />
        <div className="operion-core-atmosphere absolute inset-0" />
        <motion.div className="absolute left-1/2 top-[43%] z-20 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-emerald-200 bg-white shadow-2xl shadow-emerald-950/15" style={{ scale: coreScale }}>
          <OperionLogo size="sm" showTagline={false} tone="light" className="scale-110 justify-center" />
        </motion.div>
        <motion.div className="absolute left-1/2 top-[calc(43%+4.4rem)] z-20 -translate-x-1/2 text-center" style={{ opacity: coreLabelOpacity }}>
          <p className="text-lg font-semibold text-[#123d35]">Operion Capital</p>
          <p className="text-sm text-slate-600">Intelligent processing. Real opportunities.</p>
        </motion.div>
        <ProcessingPaths progress={progress} />
        <DataParticles progress={progress} />
        {documents.map((document, index) => (
          <DocumentCard
            key={document.label}
            document={document}
            index={index}
            progress={progress}
          />
        ))}
        <motion.div className="absolute inset-0" style={{ opacity: workerOpacity }}>
          {workers.map(([name, detail, position, angle, depth], index) => (
            <WorkerCard
              key={name}
              name={name}
              detail={detail}
              position={position}
              angle={angle}
              depth={depth}
              index={index}
              progress={progress}
            />
          ))}
        </motion.div>
        <motion.div className="absolute inset-0" style={{ opacity: lenderOpacity }}>
          <div className="network-lines absolute inset-0" />
          {lenders.map(([name, state, position, status], index) => (
            <LenderNode
              key={name}
              name={name}
              state={state}
              position={position}
              status={status}
              index={index}
              progress={progress}
            />
          ))}
        </motion.div>
      </motion.div>

      <motion.div className="absolute inset-0 flex items-center justify-center" style={{ opacity: resultOpacity, scale: resultScale }}>
        <FundingPathCard />
      </motion.div>

      <motion.div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[2rem] border border-white/80 bg-white/75 shadow-2xl shadow-emerald-950/10 backdrop-blur-xl" style={{ opacity: returnOpacity, scale: returnScale, x: returnX }}>
        <ReturnMerchantCard progress={progress} />
      </motion.div>

      <motion.div className="absolute inset-0 overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-2xl shadow-emerald-950/10" style={{ opacity: websiteOpacity, y: websiteY, scale: websiteScale }}>
        <WebsitePreview progress={progress} />
      </motion.div>
    </motion.div>
  );
}

function DocumentCard({
  document,
  index,
  progress
}: {
  document: (typeof documents)[number];
  index: number;
  progress: ReturnType<typeof useSpring>;
}) {
  const x = useTransform(progress, [0.24, 0.34, 0.48, 0.64, 0.72], ["-50%", `calc(-50% + ${document.x})`, `calc(-50% + ${document.arcX})`, `calc(-50% + ${document.pathX})`, "-50%"]);
  const y = useTransform(progress, [0.24, 0.34, 0.48, 0.64, 0.72], ["-50%", `calc(-50% + ${document.y})`, `calc(-50% + ${document.arcY})`, `calc(-50% + ${document.pathY})`, "-50%"]);
  const rotate = useTransform(progress, [0.24, 0.38, 0.54, 0.68], [0, document.rotate, document.rotate * -0.6, 0]);
  const rotateX = useTransform(progress, [0.28, 0.48, 0.68], [14, -5, 0]);
  const scale = useTransform(progress, [0.24, 0.44, 0.66], [0.76, 1, 0.68]);
  const opacity = useTransform(progress, [0.24, 0.35 + index * 0.014, 0.63, 0.7], [0, 1, 0.92, 0]);
  const filter = useTransform(progress, [0.24, 0.34, 0.52, 0.7], ["blur(3px)", "blur(0px)", "blur(1.2px)", "blur(3px)"]);

  return (
    <motion.div
      className="absolute left-1/2 top-[41%] z-10 w-36 rounded-xl border border-white/80 bg-white/86 p-3 shadow-xl shadow-emerald-950/14 backdrop-blur [transform-style:preserve-3d]"
      style={{ x, y, rotate, rotateX, scale, opacity, filter }}
    >
      <FileText className="h-5 w-5 text-emerald-700" />
      <p className="mt-3 text-xs font-semibold text-slate-700">{document.label}</p>
    </motion.div>
  );
}

function ProcessingPaths({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const opacity = useTransform(progress, [0.38, 0.48, 0.78], [0, 1, 0.62]);
  return (
    <motion.svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      viewBox="0 0 900 650"
      preserveAspectRatio="none"
      style={{ opacity }}
    >
      <ProcessingPath progress={progress} d="M190 150 C330 170 345 260 450 280" delay={0} />
      <ProcessingPath progress={progress} d="M720 160 C590 190 560 250 450 280" delay={0.04} />
      <ProcessingPath progress={progress} d="M180 500 C300 430 360 360 450 280" delay={0.08} />
      <ProcessingPath progress={progress} d="M740 495 C625 445 560 345 450 280" delay={0.12} />
      <ProcessingPath progress={progress} d="M450 585 C455 470 452 360 450 280" delay={0.16} />
    </motion.svg>
  );
}

function ProcessingPath({
  progress,
  d,
  delay
}: {
  progress: ReturnType<typeof useSpring>;
  d: string;
  delay: number;
}) {
  const pathLength = useTransform(progress, [0.4 + delay, 0.58 + delay], [0, 1]);
  const opacity = useTransform(progress, [0.38 + delay, 0.5 + delay, 0.8], [0, 0.65, 0.28]);
  return (
    <motion.path
      d={d}
      fill="none"
      stroke="#12936F"
      strokeLinecap="round"
      strokeWidth="2"
      strokeDasharray="4 10"
      style={{ pathLength, opacity }}
    />
  );
}

function DataParticles({ progress }: { progress: ReturnType<typeof useSpring> }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <DataParticle key={index} index={index} progress={progress} />
      ))}
    </div>
  );
}

function DataParticle({ index, progress }: { index: number; progress: ReturnType<typeof useSpring> }) {
  const start = 0.42 + index * 0.028;
  const x = useTransform(progress, [start, start + 0.16], [`${18 + index * 10}%`, "50%"]);
  const y = useTransform(progress, [start, start + 0.16], [`${24 + (index % 3) * 18}%`, "43%"]);
  const opacity = useTransform(progress, [start, start + 0.03, start + 0.14, start + 0.18], [0, 1, 1, 0]);
  const scale = useTransform(progress, [start, start + 0.16], [0.7, 0.28]);
  return (
    <motion.span
      className="absolute h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_16px_rgba(18,147,111,0.45)]"
      style={{ left: x, top: y, opacity, scale }}
    />
  );
}

function WorkerCard({
  name,
  detail,
  position,
  angle,
  depth,
  index,
  progress
}: {
  name: string;
  detail: string;
  position: string;
  angle: number;
  depth: number;
  index: number;
  progress: ReturnType<typeof useSpring>;
}) {
  const y = useTransform(progress, [0.43, 0.55], [18 + index * 3, 0]);
  const lift = useTransform(progress, [0.48 + index * 0.025, 0.62 + index * 0.025], [0, -8]);
  const rotateY = useTransform(progress, [0.44, 0.6, 0.72], [angle, angle * -0.35, angle * 0.18]);
  const scale = useTransform(progress, [0.44, 0.56, 0.72], [depth * 0.96, depth, depth * 0.98]);
  const glowOpacity = useTransform(progress, [0.48 + index * 0.02, 0.63 + index * 0.02], [0.1, 0.55]);
  const idleOpacity = useTransform(progress, [0.43 + index * 0.02, 0.49 + index * 0.02], [1, 0]);
  const workingOpacity = useTransform(progress, [0.43 + index * 0.02, 0.5 + index * 0.02, 0.66 + index * 0.02], [0, 1, 0]);
  const completeOpacity = useTransform(progress, [0.62 + index * 0.02, 0.7 + index * 0.02], [0, 1]);
  const progressWidth = useTransform(progress, [0.48 + index * 0.025, 0.66 + index * 0.025], ["12%", "100%"]);

  return (
    <motion.div
      className={`absolute z-30 w-44 rounded-xl border border-white/80 bg-white/88 px-3 py-3 shadow-xl shadow-emerald-950/10 backdrop-blur [transform-style:preserve-3d] ${position}`}
      style={{ y, translateY: lift, rotateY, scale }}
    >
      <motion.span className="pointer-events-none absolute -inset-2 -z-10 rounded-2xl bg-emerald-200/30 blur-xl" style={{ opacity: glowOpacity }} />
      <div className="flex items-center gap-2">
        <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <span className="absolute h-2.5 w-2.5 rounded-full bg-emerald-400 opacity-45 blur-[2px]" />
          <Workflow className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs font-bold text-[#123d35]">{name}</p>
          <p className="text-[11px] text-slate-500">{detail}</p>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-emerald-50">
        <motion.div className="h-full rounded-full bg-emerald-500" style={{ width: progressWidth }} />
      </div>
      <div className="relative mt-2 h-4 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">
        <motion.span className="absolute inset-0" style={{ opacity: idleOpacity }}>Idle</motion.span>
        <motion.span className="absolute inset-0" style={{ opacity: workingOpacity }}>Working</motion.span>
        <motion.span className="absolute inset-0 flex items-center gap-1" style={{ opacity: completeOpacity }}>
          <CheckCircle2 className="h-3 w-3" />
          Complete
        </motion.span>
      </div>
    </motion.div>
  );
}

function BusinessOwnerSilhouette() {
  return (
    <div className="business-owner-silhouette" aria-hidden="true">
      <span className="owner-shadow" />
      <span className="owner-head" />
      <span className="owner-body" />
      <span className="owner-arm owner-arm-left" />
      <span className="owner-arm owner-arm-right" />
      <span className="owner-leg owner-leg-left" />
      <span className="owner-leg owner-leg-right" />
      <span className="owner-briefcase" />
    </div>
  );
}

function LenderNode({
  name,
  state,
  position,
  status,
  index,
  progress
}: {
  name: string;
  state: string;
  position: string;
  status: "reject" | "review" | "match";
  index: number;
  progress: ReturnType<typeof useSpring>;
}) {
  const emphasis = useTransform(progress, [0.62, 0.7, 0.82], status === "match" ? [0.82, 1.08, 1.02] : [0.78, 0.98, 0.88]);
  const y = useTransform(progress, [0.6 + index * 0.018, 0.7 + index * 0.018], [28, 0]);
  const rotate = useTransform(progress, [0.6, 0.78], [index % 2 === 0 ? -5 : 5, index % 2 === 0 ? 1 : -1]);
  const opacity = useTransform(progress, [0.58 + index * 0.02, 0.68 + index * 0.02, 0.86], [0, 1, 0.96]);

  return (
    <motion.div
      className={`absolute z-30 w-40 rounded-xl border px-3 py-3 shadow-xl backdrop-blur ${position} ${
        status === "match"
          ? "border-emerald-200 bg-emerald-50/90 text-emerald-800"
          : status === "review"
            ? "border-sky-200 bg-sky-50/90 text-sky-800"
            : "border-rose-100 bg-white/90 text-slate-500"
      }`}
      style={{ scale: emphasis, y, rotate, opacity }}
    >
      <div className="flex items-center gap-2">
        {status === "match" ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-sm font-bold">{status === "review" ? "..." : "x"}</span>}
        <p className="text-sm font-semibold">{name}</p>
      </div>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em]">{state}</p>
    </motion.div>
  );
}

function CinematicBackground({ progress }: { progress: ReturnType<typeof useSpring> }) {
  return (
    <motion.div
      className="absolute inset-0"
      style={{
        background: useTransform(
          progress,
          [0, 0.45, 0.78, 1],
          [
            "linear-gradient(120deg,#fffdf7 0%,#edf7ef 42%,#e9f6ff 100%)",
            "linear-gradient(120deg,#fbfff9 0%,#ecf8f2 45%,#f4fbff 100%)",
            "linear-gradient(120deg,#f8fbf4 0%,#e8f5ef 46%,#fffaf0 100%)",
            "linear-gradient(120deg,#ffffff 0%,#f4fbf7 52%,#edf7ff 100%)"
          ]
        )
      }}
    >
      <motion.div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-emerald-200/25 blur-3xl" style={{ x: useTransform(progress, [0, 1], [0, 120]) }} />
      <motion.div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-sky-200/28 blur-3xl" style={{ x: useTransform(progress, [0, 1], [0, -120]), y: useTransform(progress, [0, 1], [0, 80]) }} />
      <motion.div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-amber-100/45 blur-3xl" style={{ opacity: useTransform(progress, [0, 0.8, 1], [0.55, 0.3, 0.7]) }} />
    </motion.div>
  );
}

function ApplicationPanel({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const rows = ["Business information", "Bank statements", "Financial documents", "Tax returns", "Contact information"];
  return (
    <div className="application-device relative w-full max-w-xl px-5 pb-8 pt-5">
      <div className="relative rounded-[1.7rem] border border-white/80 bg-white/88 p-6 shadow-2xl shadow-emerald-950/16 backdrop-blur">
        <div className="absolute -inset-px rounded-[1.7rem] bg-[linear-gradient(120deg,rgba(255,255,255,0.65),transparent_40%,rgba(18,79,64,0.08))] pointer-events-none" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-[#123d35]">Business Application</h2>
            <BriefcaseBusiness className="h-5 w-5 text-emerald-700" />
          </div>
          <div className="mt-6 space-y-3">
            {rows.map((row, index) => (
              <ApplicationRow key={row} label={row} index={index} progress={progress} />
            ))}
          </div>
          <Button className="mt-6 w-full bg-[#124f40] text-white hover:bg-[#0d3f34]">
            Submit application
            <ArrowRight className="h-4 w-4" />
          </Button>
          <div className="mt-5 flex items-center gap-2 text-xs font-medium text-slate-500">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            Your information is secure and encrypted.
          </div>
        </div>
      </div>
      <span className="absolute bottom-2 left-1/2 h-5 w-[72%] -translate-x-1/2 rounded-b-[2rem] bg-gradient-to-b from-slate-200 to-slate-100 shadow-xl shadow-emerald-950/10" />
    </div>
  );
}

function ApplicationRow({
  label,
  index,
  progress
}: {
  label: string;
  index: number;
  progress: ReturnType<typeof useSpring>;
}) {
  const opacity = useTransform(progress, [0.19 + index * 0.018, 0.24 + index * 0.018], [0.2, 1]);

  return (
    <div className="flex items-center justify-between rounded-xl bg-[#f6fbf7] px-3 py-3 text-sm text-slate-700">
      <span className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-emerald-700" />
        {label}
      </span>
      <motion.span style={{ opacity }}>
        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
      </motion.span>
    </div>
  );
}

function FundingPathCard() {
  return (
    <div className="relative w-full max-w-md overflow-hidden rounded-[1.6rem] border border-white/80 bg-white/90 p-7 text-center shadow-2xl shadow-emerald-950/12 backdrop-blur">
      <span className="absolute left-1/2 top-0 h-px w-44 -translate-x-1/2 bg-gradient-to-r from-transparent via-emerald-300 to-transparent" />
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-900/18">
        <CheckCircle2 className="h-9 w-9" />
      </div>
      <h2 className="mt-5 text-2xl font-semibold text-[#123d35]">Funding path found</h2>
      <div className="mt-5 space-y-3 text-left">
        {["Business profile qualified", "Potential lender match identified", "Information prepared", "Next step ready"].map((item) => (
          <p key={item} className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            {item}
          </p>
        ))}
      </div>
      <Button className="mt-6 w-full bg-[#124f40] text-white hover:bg-[#0d3f34]">
        View next steps
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ReturnMerchantCard({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const pathLength = useTransform(progress, [0.78, 0.88], [0, 1]);
  const noticeY = useTransform(progress, [0.8, 0.88], [34, 0]);
  const noticeOpacity = useTransform(progress, [0.8, 0.88], [0, 1]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="business-world-hero absolute inset-0 opacity-85" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_38%,rgba(255,255,255,0.82),transparent_18rem),linear-gradient(90deg,rgba(255,255,255,0.94),rgba(255,255,255,0.35))]" />
      <svg aria-hidden="true" className="absolute inset-0 z-10 h-full w-full" viewBox="0 0 900 650" preserveAspectRatio="none">
        <motion.path
          d="M690 120 C590 190 520 240 450 282 C360 338 286 392 190 510"
          fill="none"
          stroke="#12936F"
          strokeLinecap="round"
          strokeWidth="3"
          strokeDasharray="5 12"
          style={{ pathLength, opacity: noticeOpacity }}
        />
      </svg>
      <div className="relative z-10 grid h-full items-center gap-8 px-8 py-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-800">Result returned</p>
          <h2 className="mt-4 max-w-lg text-4xl font-semibold leading-[1.04] tracking-[-0.035em] text-[#071b33] sm:text-5xl">
            Next step ready.
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-slate-600">
            Your financing path is ready. Let&apos;s move your business forward.
          </p>
        </div>
        <div className="relative min-h-[340px]">
          <div className="absolute bottom-12 right-8 flex items-end gap-4">
            <div className="relative h-28 w-16">
              <BusinessOwnerSilhouette />
            </div>
            <motion.div className="mb-1 rounded-[1.25rem] border border-white/80 bg-white/92 p-5 shadow-2xl shadow-emerald-950/12 backdrop-blur" style={{ y: noticeY, opacity: noticeOpacity }}>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <CheckCircle2 className="h-6 w-6" />
                </span>
                <div>
                  <p className="font-semibold text-[#123d35]">Next Step Ready</p>
                  <p className="mt-1 text-sm text-slate-600">Your financing path is ready.</p>
                </div>
              </div>
            </motion.div>
          </div>
          <div className="absolute right-20 top-16 rounded-full border border-emerald-100 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800 shadow-sm backdrop-blur">
            Real work. Real people.
          </div>
        </div>
      </div>
    </div>
  );
}

function WebsitePreview({ progress }: { progress: ReturnType<typeof useSpring> }) {
  const lineOpacity = useTransform(progress, [0.88, 0.98], [0.82, 0.2]);
  const coreScale = useTransform(progress, [0.88, 0.98], [1.16, 0.8]);

  return (
    <div className="h-full bg-white text-[#071b33]">
      <motion.div className="network-lines pointer-events-none absolute inset-0" style={{ opacity: lineOpacity }} />
      <div className="relative h-full">
        <div className="relative h-full min-h-[310px] overflow-hidden rounded-[1.5rem] border border-slate-100 bg-[#f5fbf7]">
          <div className="business-world-hero absolute inset-0 opacity-90" />
          <motion.div className="absolute left-10 top-10 flex h-24 w-24 items-center justify-center rounded-full border border-emerald-100 bg-white/82 shadow-2xl shadow-emerald-950/12 backdrop-blur" style={{ scale: coreScale }}>
            <OperionLogo size="sm" showTagline={false} tone="light" className="scale-90 justify-center" />
          </motion.div>
          <div className="absolute bottom-8 right-8 rounded-2xl border border-white/80 bg-white/88 p-5 shadow-xl backdrop-blur">
            <Banknote className="h-7 w-7 text-emerald-700" />
            <p className="mt-4 max-w-40 text-sm font-semibold text-[#123d35]">More capital. More opportunities. A stronger tomorrow.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StaticHero() {
  return (
    <section className="relative isolate overflow-hidden px-4 pb-20 pt-16 sm:px-6 lg:px-8 lg:pb-28 lg:pt-24">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(18,79,64,0.12),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(14,165,233,0.12),transparent_24%),linear-gradient(180deg,#ffffff_0%,#f7fbf4_46%,#eef7fb_100%)]" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <OperionLogo size="lg" layout="stacked" tone="light" className="items-start text-left" />
          <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/75 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm shadow-emerald-900/5 backdrop-blur">
            <Sparkles className="h-4 w-4" />
            Intelligent capital operations
          </div>
          <h1 className="mt-8 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-[-0.035em] text-[#071b33] sm:text-6xl lg:text-7xl">
            From application to funding path, with a company operating behind it.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
            Operion Capital receives a business application, organizes the information, prepares the file, and identifies suitable financing paths for the next step.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-[#124f40] text-white shadow-lg shadow-emerald-900/20 hover:bg-[#0d3f34]">
              <Link href="/apply">
                Start application
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-slate-200 bg-white/70 text-slate-800 hover:bg-white">
              <Link href="/business-funding">See how it works</Link>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap gap-3 text-sm text-slate-600">
            {["Secure intake", "Document processing", "Human review", "No guaranteed approval claims"].map((item) => (
              <span key={item} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5">
                <BadgeCheck className="h-4 w-4 text-emerald-700" />
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="relative min-h-[560px] overflow-hidden rounded-[2rem] border border-white/80 bg-white/70 p-5 shadow-2xl shadow-emerald-950/10 backdrop-blur">
          <div className="business-world-hero absolute inset-0 opacity-90" />
          <div className="absolute bottom-6 left-6 right-6 rounded-[1.5rem] border border-white/80 bg-white/88 p-6 shadow-xl backdrop-blur">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-800">Funding path found</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[#123d35]">A clear next step forward.</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {["Business profile qualified", "Application organized", "Partner fit checked", "Next step ready"].map((item) => (
                <span key={item} className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
