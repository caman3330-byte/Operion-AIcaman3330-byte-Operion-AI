# Operion Completion Status

Updated September 13, 2026. This is an evidence-based checkpoint, not a production-complete claim.

## Production Deployment

- Current deployment: `dpl_Aykt1yam9LfEogrKHrLpjacQUzAc`, Ready and promoted to https://www.operioncapital.com/ on September 13. Previous release: `dpl_HYnA4tfLto9j3YXTUpqUEUGcEJTN`.
- Homepage and health endpoint return HTTP 200. Health reports `ok` (configuration status, not a full database transaction test).
- Cinematic removed from the live homepage; desktop and mobile 390/412-width browser checks completed. No horizontal page overflow in those homepage checks; Apply opened the application form. No FPS claim.
- Fixed dynamic routing with `continue: true` on the existing general dashboard rewrite. Merchant-detail URLs now redirect to `/supervisor/login` with HTTP 307; document links return HTTP 401 JSON without a session, instead of Vercel platform 404. Password login unchanged.
- Acquisition dry-run now skips job creation/update as well as ingestion, including failure paths. Added source-scoped provider ID deduplication and sanitized Google errors before retry logging.
- Deployment excludes local environment files, test artifacts, logs and dependencies. A pattern scan of 438 application/package files found no Google/OpenAI/Anthropic/SendGrid key patterns or private-key headers; this is not a comprehensive secret audit.
- No commit or push performed. Existing dirty work retained.

## Fresh Execution Evidence

- Document-access, acquisition dry-run, and Google adapter focused tests pass. These are mock-based tests, not real business discovery proof.
- Local real Places request returned HTTP 403: `Requests from referer <empty> are blocked.` No results, no database reads/writes, no job created. This applies to the LOCAL key only.
- Production controlled dry-run attempt returned HTTP 401 `unauthenticated`; existing local operator credential was not accepted. Google was not reached, so current Production Google authentication is NOT proven by this attempt.
- TEST recovery-only run passed PAUSED, EMERGENCY_STOP, concurrent-cycle exclusion, interrupted-process recovery, stale-worker fencing and Command Center cycle reads. Fresh recovered cycle: `dcb3441a-fa45-42b2-9493-36868f45d7b1`, two attempts, one monitoring tool execution. TEST returned to PAUSED. Historical acquisition cycles in the harness report were not rerun and are not fresh evidence.
- TEST runtime task/cycle records were created by recovery validation. No production merchant/lender records were created or modified; no emails sent.

## Implemented

- Homepage cinematic and scroll-reveal components disconnected from the homepage. Replaced with a static image and direct application/contact links. Existing cinematic source retained to preserve prior work.
- Shared public header no longer uses backdrop blur.
- Mobile dashboard navigation collapses instead of displaying all links above the workspace.
- PDF preview now requests inline access; normal downloads remain attachments. Existing authentication checks unchanged. Signed redirects are private and non-cacheable.
- PDF toolbar wraps on narrow screens.
- Earlier local improvements memoize alert reads per server render and parallelize independent prompt reads.

## Evidence

- Production build passed, including lint and type validation.
- Homepage first-load JavaScript reported by the build: 174 kB before, 111 kB after. This is not an FPS or interaction-latency measurement.
- Local homepage, application, contact, and founder login: HTTP 200.
- Local homepage opened in browser: static heading and application/contact links present; cinematic intro absent.
- Isolated document-route tests passed: PDF preview, attachment default, non-PDF attachment, private redirect headers, unauthenticated request denied without issuing a signed URL. Mocks only; zero database writes.
- TEST database policy tests passed: zero task budget blocks work and approval-required tasks are denied. Harness uses transaction rollback.
- Both local environment files identify TEST Supabase project qvzmdrghnfjqbezneqqc. Production uses Vercel configuration, not these local environment files.

## Still Needs Completion

### Internal Theme And File Room Release (Deployed September 13)

- Scoped the internal dashboard/admin theme to white/light-blue surfaces; removed sidebar/top-bar blur and the lender intelligence gold gradient. Public pages and password login are unchanged by this theme pass.
- Added Merchant Pipeline -> Review files links to the application File Room. Merchant tables scroll within their own region; acquisition card contacts wrap on narrow screens.
- Replaced the custom PDF overlay with the existing accessible dialog. Native PDF controls plus Open PDF and Download replace the unbounded, unverified custom page counter. No public access to private documents was added.
- Document workers now stay blocked until a document has recorded completed processing, and reject cross-application document IDs. Removed fabricated status-derived funding percentages; missing values display Not assessed.
- Focused document access and worker tests pass with mocks and no database writes. Typecheck, lint and production build pass. Authenticated browser appearance and PDF interaction remain unverified; these are not production-complete claims.
- The 12 expected changed application files were compared against the prior deployed source. Staged build was Ready, health passed, lenders redirected to login, and unauthenticated PDF access returned 401. After promotion, live health and login returned 200 and the production CSS contained the scoped light-theme rules. This proves asset deployment, not authenticated visual appearance.
- Business name/city/state file intake and automatic contact research are NOT implemented. The existing ingest route can write CRM leads and is not a safe substitute for an unverified research queue. Google is excluded by request; the existing alternate name-search adapter is Apollo, with no key in either local environment. Production Apollo configuration was not checked. Do not invent contacts or enable sending.

| Area | Current evidence | Remaining work |
| --- | --- | --- |
| Founder login | Existing login page loads; password flow unchanged | Legitimate TEST founder sign-in; no credentials requested in chat |
| File Room | Route tests pass; private TEST PDF verified in previous check | Authenticated browser preview, download, page navigation, mobile interaction and ownership tests |
| Document intelligence | Deployed worker blocks acknowledgment until recorded extraction completion | Implement and validate actual extraction |
| Acquisition agents | Budget and approval policies pass | Several named agents only review metrics; prove discovery, normalization, validation, deduplication, retries and persistence in the isolated TEST environment |
| Continuous operation | Fresh recovery-only test passed and ended PAUSED | Sustained acquisition cycles producing useful verified merchants remain unproven |
| Outreach | No emails sent during this work | Test approval gates, suppression, duplicate prevention and delivery lifecycle with a non-delivering test transport |
| Lender workflow | Not exercised | Prepare and test packages without external submission; founder approval remains required |
| Mobile performance | Live homepage checked at 390 and 412 widths with no horizontal overflow; Apply navigation works | Authenticated dashboard/File Room mobile interaction still needs sign-in |
| Production | Homepage, routing and dry-run safety fixes deployed | Authenticated end-to-end merchant workflow and Production discovery still need proof |

## Where To Open

- Local website: http://127.0.0.1:3035/
- TEST founder sign-in: http://127.0.0.1:3035/supervisor/login
- These addresses work on this computer while the local preview process is running.
- Use a legitimate TEST founder account. Do not share passwords in chat. Unknown credentials require a TEST-only account-owner reset, not an authentication bypass.

## Safety

No production merchant/lender records changed. No outreach, lender submissions, funding approvals, production scheduler activation or commits performed. Two staged Production deployments were built and promoted after read-only checks. Acquisition and merchant-intelligence flags are absent from Production configuration; both require explicit `true` to execute. Pre-existing modified and untracked work preserved.
