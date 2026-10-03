import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { assertDeploymentEnvironment } from "../apps/dashboard/deployment-environment.mjs";

const prodUrl = "https://qvzmdrghnfjqbezneqqc.supabase.co";
const stagingUrl = "https://dstqbiccseijydgsvlgj.supabase.co";
for (const flag of ["VERCEL_ENV", "VERCEL_TARGET_ENV"]) {
  assert.doesNotThrow(() => assertDeploymentEnvironment({ [flag]: "production", NEXT_PUBLIC_SUPABASE_URL: prodUrl }));
  assert.doesNotThrow(() => assertDeploymentEnvironment({ [flag]: "preview", NEXT_PUBLIC_SUPABASE_URL: stagingUrl }));
  assert.throws(() => assertDeploymentEnvironment({ [flag]: "preview", NEXT_PUBLIC_SUPABASE_URL: prodUrl }), /Environment safety/);
  for (const url of [stagingUrl, undefined, "invalid", "http://database.example", "https://user:password@database.example"]) {
    assert.throws(() => assertDeploymentEnvironment({ [flag]: "production", NEXT_PUBLIC_SUPABASE_URL: url }), /Environment safety/);
  }
}
assert.doesNotThrow(() => assertDeploymentEnvironment({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }));
assert.throws(() => assertDeploymentEnvironment({ NEXT_PUBLIC_SUPABASE_URL: prodUrl }), /Environment safety/);
const secret = "do-not-reflect-this-value";
try {
  assertDeploymentEnvironment({ VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: secret });
  assert.fail("Expected guard rejection");
} catch (error) {
  assert.equal(error.message.includes(secret), false);
}
const configUrl = new URL("../apps/dashboard/next.config.mjs", import.meta.url).href;
const configCheck = spawnSync(process.execPath, ["--input-type=module", "-e", `import(${JSON.stringify(configUrl)}).then(() => process.exit(2)).catch(error => process.exit(error.message.includes('Environment safety') ? 0 : 3))`], {
  env: { ...process.env, VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: stagingUrl },
  encoding: "utf8",
  timeout: 10000
});
assert.equal(configCheck.status, 0, "Next config must actually invoke the production guard");
console.log("PASS: exact production/staging/local mapping, cross-environment rejection, Next config invocation, sanitized errors. No network or database access.");
