# Durable Autonomous Company OS: Local / TEST Report

This is a bounded implementation of the core durable loop, not a claim of full
company autonomy. Work was narrowed to core safety and recovery after the request
to use fewer credits. No paid model calls were made by the validation runner.

1. **Existing autonomy reused - VERIFIED:** acquisition manager, scanner,
   worker execution modules, task queue, operating state, goals, events, tool runs,
   learning tables, memory, shared context, and Command Center.
2. **New architecture - IMPLEMENTED / PARTIALLY PROVEN:** company_cycles provides
   persistent identity, sequence, lease owner, checkpoints, retry wake time, and
   completion status. PostgreSQL serializes claims against company state. Cycle
   checkpoint writes reject stale ownership. There is one active company cycle.
3. **Files changed:** lib/autonomous-company/{durable-cycle.ts,acquisition-loop.ts,
   repository.ts,permissions.ts,learning.ts,command-center.ts};
   lib/agent-runtime/worker-runtime.ts; lib/acquisition/merchant-source-scanner.ts;
   app/(dashboard)/autonomous-operations/page.tsx; migration 0034;
   scripts/validate-durable-autonomy.cjs; scripts/test-durable-policy.cjs;
   docs/DURABLE_AUTONOMY_GAPS.md; this report and test evidence.
   Application paths are under apps/dashboard. Prior unrelated changes remain.
4. **Migration created:** packages/database/migrations/0034_durable_company_cycles.sql.
   Adds cycles, queue cycle identity and execution leases, reserved budget, and
   service-role-only claim/checkpoint functions. No legacy migration was rewritten.
5. **TEST migration applied - VERIFIED:** direct transaction against
   db.qvzmdrghnfjqbezneqqc.supabase.co. The first syntax-error attempt rolled back;
   the corrected migration applied successfully. This was not a Supabase CLI push
   and was not added to a CLI migration ledger.
6. **Controller - PARTIAL:** persists decisions before task execution, resumes
   unfinished cycles, waits for queued work, fixes the evaluation window for replay,
   and records learning/completion checkpoints. Uses configured goal target rather
   than replacing it with 500. It does not yet optimize across departments.
7. **Manager - PARTIAL:** reads goals, metrics, backlog and prior learning. Chooses
   one source per scan task. Ranking includes sample-size shrinkage and a transparent
   14-day half-life; keeps historical records. Every fifth cycle reserves a bounded
   exploration choice among approved sources. This last exploration adjustment was
   type/build checked after the three live cycles, not validated in a long experiment.
   Source discovery remains a gap; the placeholder discovery task is no longer
   emitted by the durable manager as if it were a real discovery worker.
8. **Workers - PARTIALLY VERIFIED:** durable ticks select only their cycle tasks;
   permitted workflows are source scan and acquisition monitoring. Existing execution
   modules run the work. Autonomous completions skip founder notifications, webhook
   dispatch, and workflow chaining. Protected tools are denied in code.
9. **Scheduler/runtime - PARTIAL:** the existing authenticated POST tick route now
   reaches the durable loop. No second scheduler or in-memory interval was added.
   An external recurring caller still must be configured in TEST. Continuous
   unattended operation is not proven; no production scheduler was enabled.
10. **Learning - VERIFIED CORE / PARTIAL COVERAGE:** three cycles persisted three
    source evaluations, lessons, and strategies; four evaluations in total include
    worker evidence. The next source changed after each prior result. Replay avoids
    incrementing the same source failure evidence again. Crash injection specifically
    inside EVALUATE and LEARN was not performed.
11. **Failure/recovery - VERIFIED BOUNDED CASE:** a child process exited with code
    77 after claiming a real monitoring task. After test-controlled lease expiry,
    a restarted worker completed that same task on attempt two. Exactly one tool
    run exists for it. Concurrent cycle claim was blocked; an old owner could not
    checkpoint after lease transfer. This proves crash-after-claim recovery, not
    exactly-once scanner persistence after a crash midway through extraction.
12. **Emergency stop - VERIFIED AT ENTRY:** PAUSED and EMERGENCY_STOP both rejected
    cycle execution without starting tools. Source scanning rechecks company state
    before a source and candidate persistence. In-flight network cancellation and
    every possible mid-write stop race are not proven. Final TEST state: PAUSED,
    emergency_stop=false. It was not automatically restored to OPERATIONAL.
13. **Budgets - PARTIAL, CORE DENIAL VERIFIED:** atomic claim reserves estimated
    cost across company, department, agent and task scopes and checks daily task
    limits. Zero company task budget was tested to deny claims. Reservations are
    conservative and retained for the daily window; settlement/reconciliation and
    token-level provider accounting remain incomplete. Existing scan time/page/
    source bounds are reused. Generic legacy worker budget accounting is not
    claimed to have been made fully atomic by this pass.
14. **AI Gateway - REUSED, NOT CALLED:** no second abstraction or routing policy.
    Deterministic planning and evaluation were used. The validation process removed
    provider keys. AI-assisted planning, provider-failure recovery, token budgets,
    and cost telemetry require a separate capped provider test.
15. **Command Center - PARTIAL:** reads current/recent durable cycles and displays
    current phase or idle. Goal title comes from configuration. Its briefing read
    no longer rewrites the goal. Removed the incorrect enriched-equals-newly-verified
    daily metric; velocity is marked unavailable. Snapshot construction was tested
    against TEST; authenticated browser rendering was not tested in this pass.
    Existing bounded recent-task counts remain sample counts, not full queue totals.
16. **TEST results - VERIFIED:** see test-results.json, policy-results.json and
    database-evidence.json. Cycle 1: 0 extracted / 0 verified / 0 imported.
    Cycle 2: 3 extracted / 0 verified / 0 imported. Cycle 3: 7 extracted /
    0 verified / 5 duplicates / 0 imported. First source was an existing historical
    TEST fixture pointing to a local hostname; SSRF protection rejected it. Later
    sources were ACCA and PHCC Indiana. Historical fixture claims are not new
    verified merchants. Approval-required task claims were also tested and denied.
17. **Required checks:** dashboard typecheck, lint, and final production build
    passed. No deployment was performed.
18. **Known limitations:** no continuous-operation soak test; no exact-once
    guarantee across all multi-table side effects; no comprehensive failure taxonomy;
    no process crash test in every phase; no live AI budgeting test; no newly verified
    merchants in these cycles. Some legacy observability metrics are still sampled.
19. **Before production autonomy:** reconcile migration ledger; settle budget
    reservations atomically; enforce and test all execution fences through tool
    persistence; test crashes in PLAN/EXECUTE/EVALUATE/LEARN; validate actual merchant
    verification yield; configure a bounded TEST wake source and run a sustained soak;
    then obtain explicit production approval. Production remains guarded off.
20. **Exact next phase:** TEST-only sustained acquisition and recovery validation,
    with verified-merchant yield, budget reconciliation, and every-phase crash tests.
    Keep CRM import, email, lenders, underwriting, deployment, and self-modification
    unavailable to the autonomous runtime.

No commit, push, deployment, production database modification, production environment
change, CRM import, merchant contact, lender contact, or underwriting was performed.
