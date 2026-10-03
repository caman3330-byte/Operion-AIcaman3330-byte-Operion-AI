const PRODUCTION_REF = "qvzmdrghnfjqbezneqqc";
const STAGING_REF = "dstqbiccseijydgsvlgj";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const BLOCKED_NONPRODUCTION = ["SENDGRID_API_KEY", "CRM_WEBHOOK_URL", "N8N_WEBHOOK_BASE_URL", "SLACK_WEBHOOK_URL", "STRIPE_SECRET_KEY", "ZOHO_CLIENT_SECRET"];
const AI_KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "NVIDIA_API_KEY", "GROQ_API_KEY", "GOOGLE_AI_API_KEY", "OPENROUTER_API_KEY"];

function fail(message) { throw new Error(`Environment safety: ${message}`); }
function environmentName(env) {
  const signals = [env.VERCEL_ENV, env.VERCEL_TARGET_ENV].filter(Boolean).map(value => value === "preview" ? "staging" : value === "development" ? "local" : value);
  if (env.OPERION_ENV) signals.push(env.OPERION_ENV);
  if (signals.some(value => !["production", "staging", "local"].includes(value)) || new Set(signals).size > 1) fail("conflicting or unsupported environment labels");
  return signals[0] || "local";
}
function parseUrl(value) {
  try { return new URL(value); } catch { return fail("missing or invalid target URL"); }
}
function databaseTarget(value) {
  const url = parseUrl(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) fail("invalid database protocol");
  const host = url.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host)) return "local";
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(host);
  const pooled = /\.pooler\.supabase\.com$/.test(host) && /^postgres\.([a-z0-9]+)$/.exec(decodeURIComponent(url.username));
  if (direct) return direct[1];
  if (pooled) return pooled[1];
  return fail("unrecognized database target");
}
function assertEnvironment(env, purpose = "runtime") {
  const mode = environmentName(env);
  if ((purpose === "test" || env.NODE_ENV === "test") && mode === "production") fail("tests cannot target production");
  const expected = mode === "production" ? PRODUCTION_REF : mode === "staging" ? STAGING_REF : "local";
  const url = parseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") fail("invalid Supabase URL shape");
  if (expected === "local") {
    if (!LOCAL_HOSTS.has(url.hostname) || url.protocol !== "http:" || url.port !== "54321") fail("local development must use local Supabase on port 54321");
  } else if (url.hostname !== `${expected}.supabase.co` || url.protocol !== "https:" || url.port) fail("Supabase project does not match environment");
  if (env.SUPABASE_PROJECT_REF && env.SUPABASE_PROJECT_REF !== expected) fail("project reference mismatch");
  if (env.SUPABASE_DB_URL && databaseTarget(env.SUPABASE_DB_URL) !== expected) fail("database connection target mismatch");
  for (const name of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const key = env[name];
    if (name === "NEXT_PUBLIC_SUPABASE_ANON_KEY" && key?.startsWith("sb_secret_")) fail("private key cannot be used as a public credential");
    if (!key || !key.startsWith("eyJ")) continue;
    let payload;
    try { payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()); } catch { fail("invalid Supabase credential encoding"); }
    if (payload.ref && payload.ref !== expected) fail("Supabase credential project mismatch");
    if (expected !== "local" && !payload.ref) fail("remote JWT credential has no project identity");
    const role = name === "NEXT_PUBLIC_SUPABASE_ANON_KEY" ? "anon" : "service_role";
    if (payload.role !== role) fail("Supabase credential role mismatch");
  }
  if (mode !== "production") {
    if (BLOCKED_NONPRODUCTION.some(name => env[name]?.trim())) fail("external delivery credentials are forbidden outside production");
    if (AI_KEYS.some(name => env[name]?.trim()) && env.OPERION_ALLOW_NONPRODUCTION_AI !== "true") fail("nonproduction AI requires explicit isolated configuration");
    if (["ACQUISITION_SCHEDULER_ENABLED", "MERCHANT_INTELLIGENCE_SCHEDULER_ENABLED"].some(name => env[name] === "true")) fail("nonproduction schedulers must remain disabled");
  }
  return mode;
}
function permitsExternalDelivery(env) {
  try { return assertEnvironment(env) === "production"; } catch { return false; }
}
function assertMigrationTarget(env, dbUrl, args = []) {
  const mode = assertEnvironment({ ...env, SUPABASE_DB_URL: dbUrl }, "migration");
  if (mode === "production" && !(args.includes("--approved-production") && env.OPERION_APPROVED_PRODUCTION_MIGRATION === PRODUCTION_REF)) fail("production migrations require explicit approved-production invocation and confirmation");
  return mode;
}
module.exports = { PRODUCTION_REF, STAGING_REF, environmentName, assertEnvironment, databaseTarget, permitsExternalDelivery, assertMigrationTarget };
