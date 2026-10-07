#!/usr/bin/env node

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const TESTS = [
  {
    name: "Lint Check",
    command: "npm run lint --workspace=@operion/dashboard 2>&1 | tail -20",
    required: false
  },
  {
    name: "TypeScript Check",
    command: "npm run type-check --workspace=@operion/dashboard",
    required: false
  },
  {
    name: "Production Build",
    command: "npm run build 2>&1 | tail -20",
    required: false
  },
  {
    name: "Concurrent Promotion (Atomicity)",
    command: "node test-concurrent-promotion.mjs",
    required: true
  },
  {
    name: "Manual Upload UI",
    command: "node test-manual-upload-ui.mjs",
    required: true
  },
  {
    name: "Post-Promotion Synchronization",
    command: "node test-sync-canonical.mjs",
    required: true
  },
  {
    name: "Suppression Architecture",
    command: "node test-suppression.mjs",
    required: true
  },
  {
    name: "Search/Sort/Filter",
    command: "node test-search-sort-filter.mjs",
    required: true
  },
  {
    name: "Email-Ready Service",
    command: "node test-email-ready.mjs",
    required: true
  },
  {
    name: "Metrics",
    command: "node test-metrics.mjs",
    required: true
  },
  {
    name: "Audit Events",
    command: "node test-audit-events.mjs",
    required: true
  }
];

const results = [];
let allPassed = true;

console.log("\n╔════════════════════════════════════════════════════════════════════╗");
console.log("║       OPERION LEADS GATE CLOSURE COMPREHENSIVE TEST SUITE        ║");
console.log("╚════════════════════════════════════════════════════════════════════╝\n");

for (const test of TESTS) {
  console.log(`Running: ${test.name}...`);
  console.log(`Command: ${test.command}\n`);

  try {
    const output = execSync(test.command, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024
    });

    const passed = !output.includes("❌") && !output.includes("FAILED") && !output.includes("error");

    results.push({
      name: test.name,
      passed,
      required: test.required,
      output: output.slice(-500) // Last 500 chars
    });

    if (test.required && !passed) {
      allPassed = false;
    }

    console.log(passed ? "✅ PASSED\n" : "⚠️  CHECK OUTPUT\n");
  } catch (err) {
    results.push({
      name: test.name,
      passed: false,
      required: test.required,
      output: err.toString().slice(-500)
    });

    if (test.required) {
      allPassed = false;
    }

    console.log("❌ FAILED\n");
    console.log(err.toString().slice(-300));
    console.log("\n");
  }
}

// Print summary
console.log("\n╔════════════════════════════════════════════════════════════════════╗");
console.log("║                        TEST SUMMARY                              ║");
console.log("╚════════════════════════════════════════════════════════════════════╝\n");

const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;
const requiredPassed = results.filter(r => r.required && r.passed).length;
const requiredFailed = results.filter(r => r.required && !r.passed).length;

console.log(`Total Tests:         ${results.length}`);
console.log(`✅ Passed:            ${passed}`);
console.log(`❌ Failed:            ${failed}`);
console.log(`📋 Required:          ${results.filter(r => r.required).length}`);
console.log(`  ✅ Required Passed: ${requiredPassed}`);
console.log(`  ❌ Required Failed: ${requiredFailed}`);
console.log("");

if (requiredFailed > 0) {
  console.log("❌ SOME REQUIRED TESTS FAILED\n");
  const failedTests = results.filter(r => r.required && !r.passed);
  for (const test of failedTests) {
    console.log(`\n${test.name}:`);
    console.log(test.output);
  }
  process.exit(1);
} else if (allPassed) {
  console.log("✅ ALL TESTS PASSED\n");
  process.exit(0);
} else {
  console.log("⚠️  OPTIONAL TESTS FAILED (but all required tests passed)\n");
  process.exit(0);
}
