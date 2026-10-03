# Controlled Operations Release Checklist

Updated September 14, 2026. Requested target: end of the upcoming week. This is a target, not a guarantee or evidence of continuous background execution.

## Blocking Environment Finding

On September 14, read-only inspection of the LIVE /supervisor/login JavaScript assets found the public Supabase URL qvzmdrghnfjqbezneqqc.supabase.co. The founder had explicitly designated this project TEST-only. This proves the deployed browser configuration uses that project; the server service-role target was not independently verified. Do not assume environment separation or label all displayed records production-real.

Deployments, database validation writes and automation activation are paused pending confirmation of the intended production project. Do not create a project, migrate data, change keys, delete records or reinterpret the TEST designation without founder confirmation.

The provided September 13 recording displays zero active workers, five blocked tasks, eleven failed tasks and a TEST-related worker history entry. These are observations of the recording, not fresh database totals. Several navigations show loading skeletons from approximately 12 seconds through the end of the 23-second recording. It does not establish the underlying latency source or FPS.

## Additional Local Work (Not Deployed)

- Next build configuration now rejects Vercel production builds that target the founder-designated TEST hostname, or lack a valid HTTPS Supabase URL. Tests exercise the guard and its actual Next config integration without network access. Local/preview builds are permitted. This does not retroactively affect the deployed site, inspect server credentials, prove an alternative project is production, or protect promotion of an already-built preview.
- Acquisition cards link to individual lead records; Leads names open details with a full-record/history/files link.
- Lead records show stored validation flags/timestamp/reason and warn that absence of a test flag is not proof of a real business. Private PDF viewing uses the existing authenticated viewer.
- Header alerts stream separately; identical page-access checks are reused only within a server render. Password and authorization rules are unchanged.
- An unavailable lead query is no longer displayed as an empty database.
- Lead tables render 25 loaded rows at a time, support ID/phone/state search and explicitly disclose that up to the latest 100 records are loaded. Database-wide search/pagination remains incomplete.
- Independent cycle and command-center reads begin together instead of waiting for the first query before starting the others.
- Focused mock-only tests pass for list filtering/pagination, private document access and zero-write acquisition dry-run behavior. No network, emails or database writes in those tests. Authenticated visual performance and real acquisition are still unproven.

### Immediate Founder Prerequisite

Identify the intended production Supabase project in https://supabase.com/dashboard/projects, or provide a screenshot of project names (no keys/passwords). The existing TEST designation must not be silently changed. No additional lead-source or email credentials are requested until this boundary is resolved. Once confirmed, configure the correct environment through the account, then perform authorized read-only production verification and isolated test writes only in a separately confirmed TEST project.

## Released

- Static public homepage, corrected merchant routing and private document access.
- Internal light theme, responsive merchant table and File Room entry points.
- Document task completion cannot substitute for actual extraction.
- Latest release: dpl_Aykt1yam9LfEogrKHrLpjacQUzAc. Ready, promoted, production health HTTP 200.

## Required Release Gates

| Workstream | Remaining implementation or proof | Acceptance evidence |
| --- | --- | --- |
| Internal screens | Legitimate authenticated desktop/mobile review | Light theme, no clipped actions, working real private PDF preview/download |
| Business list intake | Separate unverified name/city/state research queue; bounded batches, validation and deduplication | Uploaded names remain unverified until evidence is collected; duplicates do not create additional leads |
| Lead research | Choose an authorized working source; Google is currently excluded by user request | Actual business identity and contact evidence with source URL, timestamps and failure states; no invented contacts |
| Outreach | Prove recipient eligibility, approval, suppression, opt-out, atomic worker claiming and retry safety | Non-delivering tests demonstrate no duplicate sends, no test recipients and no sends after opt-out; founder-approved pilot only |
| Applications and files | Prove application/contact attribution and private document ownership | Controlled TEST application -> secure upload -> founder File Room; unauthorized access denied |
| Document intelligence | Real parser/OCR execution and durable processing results | Supported fields extracted from known TEST statements with provenance; missing values remain missing; human financial review |
| Lender preparation | Verify partner criteria, matching explanation, package completeness and approval | Founder reviews an actual TEST package; no external submission during validation |
| Operations | Sustained useful cycles, bounded budgets, alerts and restart recovery | Recorded runs, failures, retries and real counts; pause/emergency stop work; no synthetic production metrics |

## Founder Inputs

1. Sign in normally in the connected in-app browser for protected visual checks. Do not share passwords or tokens in chat. Production screen checks are read-only; controlled workflow writes use the isolated TEST project.
2. Select initial industries, US states, daily lead cap and maximum monthly service budget. Google remains excluded unless explicitly restored. Apollo is absent locally and in Production; public directory sources need separate live validation.
3. Confirm the sender/reply-to address and control of its domain. Production contains SendGrid and sender-address entries; account verification and actual delivery have not been proven by environment metadata.
4. Identify lender partners authorized to receive applications, their requirements and the founder approval recipient. Do not send every merchant's financial documents to every lender.
5. Approve outreach wording, audience and a small pilot send limit before activation. Secure upload links collect statements; no blanket autonomous lender submission or funding decisions.

## Configuration Evidence

Read-only Production environment metadata on September 13 showed SendGrid, OpenAI and Anthropic entries. Apollo and the two acquisition scheduler entries were absent. Entry presence is not proof of valid credentials, billing, sender verification or live API success. No secret values were printed.

## Safety

No outreach sent, no production merchant/lender records changed, no acquisition flags enabled, no Google settings changed and no commit performed during this release. Password authentication remains unchanged. Current authenticated browser checks are blocked on legitimate sign-in, not bypassed.
