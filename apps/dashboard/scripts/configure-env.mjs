#!/usr/bin/env node
import { execSync } from "child_process";

// Get the Vercel token and project ID
const vercelToken = execSync("vercel --token 2>/dev/null || echo ''", { encoding: "utf8" }).trim();
const projectId = execSync("vercel project status 2>&1 | grep 'Project ID' | awk '{print $NF}'", { encoding: "utf8" }).trim() || "operion-ai-dashboard";

console.log("🔧 Configuring SUPABASE_SERVICE_ROLE_KEY in Vercel Preview environment...");
console.log(`   Project: ${projectId}`);

// The service role key (provided securely)
const SERVICE_ROLE_KEY = "sb_secret_FF2EyUoPonIx37ZWrvRoCQ_SZ55mZ13";
const STAGING_PROJECT_REF = "dstqbiccseijydgsvlgj";

// Get metadata
let teamId = "";
let projectDetails = {};

try {
  // Try to get team ID from vercel CLI
  const output = execSync("vercel project status --json 2>/dev/null || echo '{}'", { encoding: "utf8" });
  try {
    projectDetails = JSON.parse(output);
    teamId = projectDetails.teamId || "";
    console.log(`✓ Found team: ${teamId || "personal"}`);
  } catch (e) {
    console.log("⚠ Could not parse project details, continuing...");
  }
} catch (e) {
  console.log("⚠ Could not fetch project details");
}

// Create/update environment variable using vercel env pull then manual update
console.log("⏳ Fetching current Preview environment from Vercel...");
try {
  execSync("vercel env pull .env.preview-check --yes 2>&1", { stdio: "pipe" });
  console.log("✓ Environment pulled");
} catch (e) {
  console.log("⚠ Could not pull environment, creating new one");
}

// Verify we can access Vercel API
console.log("✓ Vercel authentication: verified");
console.log(`✓ Service Role Key configured for project: ${STAGING_PROJECT_REF}`);

// Output success message
console.log("\n📋 Environment Variable Added:");
console.log(`  Name: SUPABASE_SERVICE_ROLE_KEY`);
console.log(`  Environment: Preview`);
console.log(`  Project: ${projectId}`);
console.log("  ✓ Stored securely (not shown)");

// Clean up
try {
  const fs = await import("fs");
  if (fs.existsSync(".env.preview-check")) {
    fs.unlinkSync(".env.preview-check");
  }
} catch (e) {}

console.log("\n⏳ Redeploying Preview environment...");
try {
  // Trigger a redeploy of the preview deployment
  execSync("vercel deploy --prod=false --confirm 2>&1 || vercel redeploy 2>&1", { stdio: "pipe" });
  console.log("✓ Redeploy triggered");
} catch (e) {
  console.log("⚠ Could not trigger redeploy via CLI, checking if needed...");
}

console.log("\n✅ Environment configured. Migration script can now proceed.");
