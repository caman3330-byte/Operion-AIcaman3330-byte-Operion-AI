// Stamping every file as applied fabricated migration history. A replacement
// must verify individual schema objects and require approval before any write.
console.error("Blind migration-ledger reconciliation is disabled. Review schema evidence and obtain approval for a targeted reconciliation.");
process.exitCode = 1;
