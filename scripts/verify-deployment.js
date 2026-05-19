const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const root = path.resolve(__dirname, "..");
const dashboardRoot = path.join(root, "apps", "dashboard");

const requiredEnvKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY"
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function verifyHttpEndpoint(baseUrl, route) {
  const url = new URL(route, baseUrl).toString();
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${route} returned ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

function verifyVercelConfig() {
  const vercelConfigPath = path.join(root, "vercel.json");
  const config = readJson(vercelConfigPath);

  assert(config.version === 3, "vercel.json must use version 3");
  assert(config.installCommand === "npm install", "vercel.json installCommand must be 'npm install'");
  assert(config.buildCommand === "npm run build", "vercel.json buildCommand must be 'npm run build'");
  assert(config.framework === "nextjs", "vercel.json framework must be 'nextjs'");
  assert(config.rootDirectory === "apps/dashboard", "vercel.json rootDirectory must be 'apps/dashboard'");
  assert(config.outputDirectory === ".next", "vercel.json outputDirectory must be '.next'");

  console.log("✔ vercel.json is canonical for apps/dashboard monorepo deployment");
}

function verifyDashboardRoutes() {
  const pagePath = path.join(dashboardRoot, "app", "page.tsx");
  const layoutPath = path.join(dashboardRoot, "app", "layout.tsx");
  const healthRoutePath = path.join(dashboardRoot, "app", "api", "health", "route.ts");

  assert(fs.existsSync(pagePath), "Dashboard root app/page.tsx must exist");
  assert(fs.existsSync(layoutPath), "Dashboard root app/layout.tsx must exist");
  assert(fs.existsSync(healthRoutePath), "Dashboard api/health route must exist");

  console.log("✔ Dashboard root page, layout, and health route are present");
}

function verifyBuildOutput() {
  const manifestPath = path.join(dashboardRoot, ".next", "server", "app-paths-manifest.json");
  assert(fs.existsSync(manifestPath), "Dashboard .next/server/app-paths-manifest.json must exist after build");

  const manifest = readJson(manifestPath);
  assert(manifest["/page"], "Root page path must be present in app-paths-manifest.json");
  assert(manifest["/api/health/route"], "API health route must be present in app-paths-manifest.json");

  console.log("✔ Dashboard build output manifest contains root and API health routes");
}

function verifyEnvExample() {
  const envExamplePath = path.join(root, ".env.example");
  assert(fs.existsSync(envExamplePath), ".env.example must exist at the repo root");

  const envContents = fs.readFileSync(envExamplePath, "utf8");
  requiredEnvKeys.forEach((key) => {
    assert(envContents.includes(`${key}=`), `.${key} entry must exist in .env.example`);
  });
  console.log("✔ .env.example contains required Supabase variables");
}

async function verifyHttpEndpoints() {
  const baseUrl = process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) {
    console.warn("⚠ BASE_URL or NEXT_PUBLIC_BASE_URL not configured, skipping live endpoint verification.");
    return;
  }

  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  await verifyHttpEndpoint(normalized, "/");
  await verifyHttpEndpoint(normalized, "/dashboard");
  await verifyHttpEndpoint(normalized, "/api/health");

  console.log(`✔ Live endpoints responded successfully for ${normalized}`);
}

async function run() {
  try {
    verifyVercelConfig();
    verifyDashboardRoutes();
    verifyEnvExample();
    verifyBuildOutput();
    await verifyHttpEndpoints();
    console.log("\n✅ Deployment verification completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("\n✖ Deployment verification failed:", error.message);
    process.exit(1);
  }
}

run();
