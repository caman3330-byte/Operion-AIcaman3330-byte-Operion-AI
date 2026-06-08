"use client";

import { useEffect, useRef } from "react";

type FunnelEvent = "landing_page_visit" | "ig_visit" | "business_funding_visit" | "apply_cta_click" | "application_started";

interface MerchantFunnelTrackerProps {
  event: FunnelEvent;
  source?: string | null;
  path?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}

export function MerchantFunnelTracker({ event, source, path, utmSource, utmMedium, utmCampaign }: MerchantFunnelTrackerProps) {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    trackMerchantFunnelEvent({
      event,
      source,
      path,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign
    });
  }, [event, path, source, utmCampaign, utmMedium, utmSource]);

  return null;
}

export function trackMerchantFunnelEvent(payload: {
  event: FunnelEvent;
  source?: string | null | undefined;
  path?: string | null | undefined;
  utm_source?: string | null | undefined;
  utm_medium?: string | null | undefined;
  utm_campaign?: string | null | undefined;
}) {
  const body = JSON.stringify(payload);
  const url = "/api/analytics/merchant-funnel";

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon(url, blob)) return;
  }

  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true
  }).catch(() => undefined);
}
