import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;
const TOKEN_PREFIX = "opas_";

/** Opaque token only: database rows store its SHA-256 digest, never the bearer token. */
export function createProspectApplicationToken() {
  const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString("base64url")}`;
  return { token, tokenHash: hashProspectApplicationToken(token) };
}

export function hashProspectApplicationToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isProspectApplicationToken(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith(TOKEN_PREFIX)) return false;
  const secret = value.slice(TOKEN_PREFIX.length);
  return secret.length >= 43 && /^[A-Za-z0-9_-]+$/.test(secret);
}

export function applicationTokenHashMatches(token: string, expectedHash: string) {
  const actual = Buffer.from(hashProspectApplicationToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
