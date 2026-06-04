const baseUrl = process.env.DASHBOARD_URL || process.env.BASE_URL || "http://localhost:3000";

const routes = [
  "/admin",
  "/admin/leads",
  "/admin/lenders",
  "/admin/testing",
  "/admin/ai",
  "/supervisor",
  "/supervisor/ai-operations",
  "/supervisor/ai-agents",
  "/testing",
  "/acquisition",
  "/leads",
  "/lenders",
  "/merchants",
  "/reports",
  "/audit"
];

if (process.env.MERCHANT_DETAIL_ID) {
  routes.push(`/merchants/${process.env.MERCHANT_DETAIL_ID}`);
}

const forbidden = [
  "Operations Admin",
  "Founder Review Queue",
  "Application Lifecycle",
  "Operational Test Controls",
  "AI Operations Center",
  "Supervisor Command Center",
  "Test Email Recipient",
  "MCA Flow Readiness",
  "Lead Sources",
  "Founder Acquisition Dashboard",
  "Lender routing",
  "Workflow Monitor",
  "Underwriting Queue",
  "Merchant profile and application lifecycle",
  "Uploaded documents",
  "AI task history"
];

async function check(route) {
  const url = new URL(route, baseUrl).toString();
  const response = await fetch(url, { redirect: "manual" });
  const text = await response.text();
  const leaks = forbidden.filter((pattern) => text.includes(pattern));
  const redirected =
    response.status === 301 ||
    response.status === 302 ||
    response.status === 303 ||
    response.status === 307 ||
    response.status === 308 ||
    text.includes("Redirecting to secure access") ||
    text.includes("Internal operator session required");

  return {
    route,
    status: response.status,
    redirected,
    bytes: text.length,
    leaks
  };
}

async function main() {
  const results = [];
  for (const route of routes) {
    results.push(await check(route));
  }

  for (const result of results) {
    console.log(
      `${result.route} -> ${result.status} bytes=${result.bytes} redirected=${result.redirected} leaks=${result.leaks.join(",") || "none"}`
    );
  }

  const failed = results.filter((result) => result.leaks.length > 0 || !result.redirected);
  if (failed.length > 0) {
    console.error("Protected payload verification failed.");
    process.exit(2);
  }

  console.log("Protected payload verification passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
