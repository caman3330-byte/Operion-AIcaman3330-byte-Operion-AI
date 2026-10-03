# Durable Autonomy Gap Report

The existing acquisition manager, task queue, source scanner, tool registry/runs,
company state, goals, learning records, memory, AI Gateway, and Command Center
are reused. The current scheduler entry is POST /api/autonomous/acquisition/tick.
There is no durable company cycle record or process-independent checkpoint.

Critical gaps found during inspection:

- PAUSED does not reject the shared execute_tasks check.
- The acquisition loop invokes a global worker tick, potentially consuming other departments.
- Task retries have no enforced delay or permanent-failure classification.
- Task claims are conditional, but lack lease expiry and company-wide budget locking.
- Budget reads upsert limits, and incrementBudget resets the configured limit to zero.
- Planning ranks raw historical percentages and can select an older strategy over a newer one.
- Learning replay can repeatedly increment source failure streaks.
- Goal refresh overwrites the target with 500; the brief labels enriched as newly verified.
- Command Center counts are bounded recent samples, not complete queue totals.
- Worker completion can dispatch webhooks and founder notifications.

Minimum extension: durable leased cycles with fenced checkpoints, cycle-scoped
queue execution, delayed bounded recovery, immutable action allowlist, atomic
budget reservations, recency/sample-aware source ranking, idempotent learning,
and read-only cycle visibility. Production remains disabled by an explicit TEST
project guard. Existing API/provider abstractions remain intact. No new timer loop.

TEST project: qvzmdrghnfjqbezneqqc. Live evidence must be distinguished from unit
fixtures. Public-source output is not deterministic; recovery and policy tests
must not be described as proving extraction quality or continuous availability.
