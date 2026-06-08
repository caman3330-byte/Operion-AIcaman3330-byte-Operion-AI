"use client";

import Link from "next/link";
import type { Route } from "next";
import type { ComponentProps } from "react";
import { trackMerchantFunnelEvent } from "./merchant-funnel-tracker";

type TrackedApplyLinkProps = ComponentProps<typeof Link> & {
  source: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
};

export function TrackedApplyLink({ source, utmSource, utmMedium, utmCampaign, onClick, href, ...props }: TrackedApplyLinkProps) {
  return (
    <Link
      {...props}
      href={href as Route}
      onClick={(event) => {
        trackMerchantFunnelEvent({
          event: "apply_cta_click",
          source,
          path: typeof href === "string" ? href : String(href),
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign
        });
        onClick?.(event);
      }}
    />
  );
}
