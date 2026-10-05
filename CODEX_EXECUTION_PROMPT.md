# CODEX EXECUTION PROMPT
## Frontend Build - Non-Stop UI/UX Implementation

**Start:** October 6, 2026  
**Mode:** Continuous execution - No stops, no waiting  
**Objective:** Complete frontend for 5-stage Operion workflow  

---

## YOUR JOB

You are the **frontend architect and executor** for Operion Capital. You:
- Build all user-facing pages and components
- Design and implement themes (light blue for merchant, light green for lenders)
- Create responsive, mobile-friendly UI
- Implement search, sort, filter on every page
- Build real-time interactions
- Work alongside Claude (he builds backend, you build frontend - same phases, parallel)

**You work in PARALLEL with Claude:**
- Claude builds API/database (same phase, different layer)
- You build UI/components (same phase, different layer)
- Coordinate on: database schemas, endpoint contracts, theme colors
- NO WAITING between phases

---

## EXECUTION FLOW

### PHASE 1: DATA VERIFICATION (NOW - 2-4 hours)
**What you do:**
- [ ] Review existing manual upload component (`apps/dashboard/components/data/manual-data-upload.tsx`)
- [ ] Test file selection UI
- [ ] Test preview table display
- [ ] Test hash confirmation button
- [ ] Verify error messages display clearly
- [ ] Test file re-upload for duplicate detection
- [ ] Validate preview form layout

**Deliverables:**
- [ ] Existing component working correctly
- [ ] All 8-point verification visual elements present
- [ ] Ready for Phase 2

---

### PHASE 2: LEADS UI (4-6 hours)

**New Page: `/leads`**

**Layout:**
```
+-------------------------------------------+
| Search: [____________] | Sort: [status ▼] |
+-------------------------------------------+
| Filter: [industry ▼] [state ▼] [has_email]|
+-------------------------------------------+
| ┌─────────────────────────────────────┐   |
| │ Business Name | Address | Status    │   |
| │───────────────────────────────────────│   |
| │ Acme Corp     | 123 Main | imported  │   |
| │ Tech Startup  | 456 Oak  | qualified │   |
| │ ...                                 │   |
| └─────────────────────────────────────┘   |
+-------------------------------------------+
| Page 1 of 5 (25 per page)                 |
+-------------------------------------------+
```

**Components:**

1. **Leads List Table**
   - Columns: Business Name, Address, Phone, Email, Status, Industry, State, Actions
   - Clickable rows → detail view
   - Sortable headers (click to sort)
   - Status badges: imported (gray), qualified (blue), outreach_ready (green), sent (purple), replied (gold)

2. **Search Bar**
   - Placeholder: "Search by business name, address, phone, email..."
   - Real-time search (debounced)
   - Clear button

3. **Filter Sidebar**
   - Status filter (multi-select checkboxes)
   - Industry (text input with autocomplete)
   - State (dropdown)
   - Has Email (toggle)
   - Has Phone (toggle)
   - Clear all filters button

4. **Sort Dropdown**
   - Created (newest first)
   - Created (oldest first)
   - Status
   - Enrichment Score (highest first)

5. **Pagination**
   - Show "Page X of Y (total records)"
   - Previous/Next buttons
   - Jump to page input

6. **Lead Detail View (Modal or Side Panel)**
   ```
   Business Name: Acme Corp
   Owner Name: John Smith
   Industry: Retail
   Address: 123 Main St, Denver, CO 80202
   Phone: (303) 555-1234
   Email: john@acme.com
   Website: acme.com
   
   Status: qualified
   Enrichment Score: 85/100
   Created: Oct 1, 2026
   Qualified: Oct 3, 2026
   
   Timeline:
   - Oct 1: Imported from DATA
   - Oct 2: Enriched (Apollo API)
   - Oct 3: Marked qualified
   
   [Promote to Lead] button (if not already promoted)
   [Ready for Outreach] indicator
   ```

7. **Promote to Lead Button**
   - Only show if status != 'outreach_ready'
   - Click → confirm dialog
   - On confirm → lock button + loading spinner
   - On success → update status to 'outreach_ready'

**Theme:**
- Clean, professional
- Blue accents for actions
- Gray for neutral states
- Green for "ready" states
- Red for errors

**Responsive:**
- Desktop: Full table with all columns
- Tablet: Hide less important columns, show in detail view
- Mobile: List view with cards (tap to expand detail)

**Code:**
- Location: `apps/dashboard/app/(authenticated)/leads/page.tsx`
- Component: `apps/dashboard/components/leads/leads-list.tsx`
- Hooks: useLeads(), useLeadSearch(), useLeadFilter()
- State: React Query for caching, Zustand for filters

---

### PHASE 3: MERCHANT OUTREACH UI (6-8 hours)

**New Page: `/outreach/campaigns`**

**Theme: Light Blue** (funding ad aesthetic)

**Layout:**
```
+─────────────────────────────────────────+
| [Create Campaign] [Refresh]             |
+─────────────────────────────────────────+
| Campaign Name | Sent | Open% | Click% | |
|───────────────────────────────────────────|
| Fall Funding Drive | 247 | 42% | 18%  | |
| Early Bird Special | 150 | 35% | 12%  | |
+─────────────────────────────────────────+
```

**Components:**

1. **Campaign List**
   - Table: Campaign Name, Status, Recipients, Sent Count, Open Rate, Click Rate, Reply Rate
   - Click row → detail view
   - Status badges: draft, scheduled, sending, sent, paused

2. **Create Campaign Modal**
   - Step 1: Campaign Details
     - Name: [text input]
     - Select Template: [dropdown - light blue funding ad]
     - Schedule: [date/time picker] or [send now]
   - Step 2: Select Recipients
     - Search/filter leads with status='outreach_ready'
     - Multi-select checkboxes
     - Show count: "Send to 47 leads?"
   - Step 3: Confirm
     - Show preview
     - [Send Campaign] button

3. **Campaign Detail View**
   ```
   Campaign: Fall Funding Drive
   Status: sent
   Created: Oct 3, 2026
   Sent: Oct 4, 2026
   
   Recipients: 247
   Delivered: 247 (100%)
   Opened: 104 (42%)
   Clicked: 44 (18%)
   Replied: 12 (5%)
   Bounced: 0
   
   [View Email Template] [Export Report]
   
   Replies Tab:
   - From: john@acme.com | Subject: "Interested in funding"
     "Yes, we'd like to apply for a loan..."
     [Quick Reply] [Mark as Application]
   
   Applications Tab:
   - Name: John Smith | Business: Acme Corp | Funding: $50k | Revenue: $200k/mo
     [View Details] [Move to Contacts]
   ```

4. **Email Template Preview**
   - Show light blue HTML email
   - Funding ad copy
   - Application form button/link
   - Unsubscribe link

5. **Reply Inbox**
   - List of all replies from campaigns
   - Show: from_email, subject, received_at
   - Click → expand body
   - [Quick Reply] button → reply in same thread
   - [Mark as Application] button → create application_submission

6. **Application Tracker**
   - Live updates as forms are submitted
   - Show: applicant_name, business_name, funding_needed, monthly_revenue
   - Real-time badge count (e.g., "5 new applications")
   - [View Application] → detail modal

7. **Real-time Notifications (Toast)**
   - "Email sent to 47 recipients"
   - "New reply from john@acme.com"
   - "New application submitted"

**Code:**
- Location: `apps/dashboard/app/(authenticated)/outreach/page.tsx`
- Components: `apps/dashboard/components/outreach/campaign-list.tsx`, `campaign-detail.tsx`, `create-campaign-modal.tsx`
- Real-time: WebSocket or polling for new replies/applications
- Email template: pre-built light blue HTML

---

### PHASE 4: CONTACTS / MERCHANTS UI (2-3 hours)

**New Page: `/contacts`**

**Layout:**
```
+──────────────────────────────────────+
| Search: [____________]  Filter: [all]|
+──────────────────────────────────────+
| Business Name | Contact | Status    |
|────────────────────────────────────────|
| Acme Corp | John Smith | interested |
| Tech Inc  | Sarah Tech | interested |
+──────────────────────────────────────+
```

**Components:**

1. **Contacts List**
   - Table: Business Name, Owner, Address, Phone, Email, Interested On
   - Only show prospects with status='interested'
   - Click row → detail card

2. **Search Bar**
   - Search by business name, owner name, phone, email

3. **Contact Card (Detail)**
   ```
   Business: Acme Corp
   Owner: John Smith
   Phone: (303) 555-1234
   Email: john@acme.com
   Address: 123 Main St
   
   Interested On: Oct 4, 2026
   Interest Reason: Replied to funding email
   
   Last Contact: Oct 5, 2026
   
   [Call] [Email] [View in Leads] [Not Interested]
   ```

4. **Not Interested Button**
   - Modal: "Why not interested?"
   - Options: [No Response], [Rejected], [Other]
   - Moves contact back to leads with flag
   - Updates lead.status = 'not_interested'

**Code:**
- Location: `apps/dashboard/app/(authenticated)/contacts/page.tsx`
- Component: `apps/dashboard/components/contacts/contact-list.tsx`
- Filter: Show only leads where interest_marked=true

---

### PHASE 5: LENDERS OUTREACH UI (5-7 hours)

**New Page: `/lenders`**

**Theme: Light Green** (lender partner aesthetic)

**Layout:**
```
+──────────────────────────────────────+
| [Add Lender]                         |
+──────────────────────────────────────+
| Lender Name | Email | Max Loan | Status|
|────────────────────────────────────────|
| Quick Fund Inc | hello@qf.com | $500k | active |
| Fast Loans LLC | info@fl.com | $1m | active |
+──────────────────────────────────────+
```

**Components:**

1. **Lenders List**
   - Table: Lender Name, Email, Phone, Industry Focus, Max Loan Amount, Status
   - Click to edit
   - Status badges: active (green), inactive (gray)

2. **Add/Edit Lender Form**
   - Name: [text]
   - Email: [email]
   - Phone: [phone]
   - Industry Focus: [multi-select tags]
   - Max Loan Amount: [number]
   - Min Monthly Revenue: [number]
   - Status: [toggle active/inactive]
   - [Save] [Cancel]

3. **Delete Lender**
   - Soft delete (status → inactive)
   - Confirmation: "This will mark all unsent applications as archived"

**New Page: `/applications`**

**Layout:**
```
+───────────────────────────────────────────+
| Filter: [All Lenders ▼] | [Bulk Send]    |
+───────────────────────────────────────────+
| □ Applicant | Business | Funding | Lender|
|──────────────────────────────────────────--|
| □ John S | Acme Corp | $50k | (not sent) |
| □ Sarah T | Tech Inc | $75k | (not sent) |
+───────────────────────────────────────────+
```

**Components:**

1. **Applications List**
   - Columns: Checkbox, Applicant Name, Business Name, Funding Needed, Monthly Revenue, Status
   - Status: draft, sent, pending, approved, rejected
   - Filter by: lender, status
   - Multi-select checkboxes for bulk send

2. **Bulk Send Modal**
   - Show selected applications count
   - Select lender: [dropdown]
   - Format: [PDF] [Word] (radio buttons)
   - [Send] button
   - On success: show "Sent 12 applications to Quick Fund Inc"
   - Show: date_sent, lender_email, document_link

3. **Lender Thread View**
   - Show all applications sent to one lender
   - Table: Date Sent, Applicant, Business, Funding, Status, Response
   - Click → expand response details
   - Status badges: pending (yellow), approved (green), rejected (red)

4. **Application Detail Card**
   ```
   Applicant: John Smith
   Business: Acme Corp
   Address: 123 Main St
   Phone: (303) 555-1234
   Email: john@acme.com
   
   Funding Needed: $50,000
   Monthly Revenue: $200,000
   
   Sent to: Quick Fund Inc
   Sent on: Oct 5, 2026
   Status: pending
   Response: (awaiting)
   
   [View PDF] [Resend] [Move to Different Lender]
   ```

**Real-time Updates:**
- Update application status when lender responds
- Toast: "Lender approved 3 applications"

**Code:**
- Location: `apps/dashboard/app/(authenticated)/lenders/page.tsx`, `/applications/page.tsx`
- Components: `lender-list.tsx`, `applications-list.tsx`, `bulk-send-modal.tsx`
- Light green theme colors

---

### PHASE 6: GLOBAL + SETTINGS (3-4 hours)

**Global Navigation (Top Bar)**
```
Operion Capital | [DATA] [LEADS] [OUTREACH] [CONTACTS] [LENDERS] [⚙️ Settings] [👤 User]
```

**New Page: `/settings`**

**Email Configuration Section:**
```
Merchant Email From:
[operion-merchant@example.com]

Lender Email From:
[operion-lenders@example.com]

Application Email From:
[operion-apps@example.com]
```

**Theme Toggle:**
- Light/Dark mode
- Persistent to localStorage

**User Profile:**
- Name, email, role
- Password change
- Logout

**AI Chat Sidebar**
```
+─────────────────────────+
| Chat with Operion AI    |
+─────────────────────────+
| How many leads in CA?   |
| [responding...]         |
|                         |
| 123 leads in California |
| (87 qualified, 36 ready)|
+─────────────────────────+
| [Type a question...]    |
+─────────────────────────+
```

**AI Chat Features:**
- Text input at bottom
- Message history scrollable
- Claude responds with Operion insights
- Examples: "Show me top industries", "Which lenders approved most apps?"

**Real-time Notifications**
- Toast in bottom-right corner
- Types: success (green), error (red), info (blue), warning (yellow)
- Auto-dismiss after 5 seconds
- Examples:
  - "✅ Campaign sent to 47 leads"
  - "📧 New reply from john@acme.com"
  - "✅ Application approved by Quick Fund Inc"

**Search on Every Page**
- Global search (top navigation bar)
- Search across: prospects, leads, contacts, lenders, campaigns
- Quick preview on hover
- Click to navigate

**Sort on Every Page**
- Column headers are clickable
- Click → sort ascending/descending
- Show sort indicator (↑/↓)

**Code:**
- Location: `apps/dashboard/app/(authenticated)/settings/page.tsx`
- Components: `app-nav.tsx`, `chat-sidebar.tsx`, `notifications.tsx`
- Global context: useNotifications hook
- Real-time: WebSocket connection for notifications

---

### PHASE 7: TESTING + FINAL POLISH (2-3 hours)

**Testing:**
- [ ] E2E test all pages (DATA → LEADS → OUTREACH → CONTACTS → LENDERS)
- [ ] Test on mobile (375px), tablet (768px), desktop (1024px+)
- [ ] All components responsive
- [ ] All forms submit correctly
- [ ] Search/filter/sort working everywhere
- [ ] Real-time notifications display
- [ ] AI chat working
- [ ] Theme colors (light blue, light green) applied correctly

**Polish:**
- [ ] Confirm theme colors with user (light blue hex, light green hex)
- [ ] Button hover states, active states
- [ ] Loading states on all async actions
- [ ] Error state displays (validation messages, API errors)
- [ ] Empty states (no leads, no campaigns, etc.)
- [ ] Accessibility: tab navigation, ARIA labels, keyboard shortcuts

**Responsive Design:**
- [ ] Desktop: Full layout, all columns visible
- [ ] Tablet: Adaptive layout, some columns hidden
- [ ] Mobile: Card-based view, single column, touch-friendly buttons (48px min)

**Performance:**
- [ ] Pagination working (don't load all 10k leads at once)
- [ ] Search debounced
- [ ] Real-time updates optimized (not polling every 100ms)
- [ ] Images optimized (if any)

**Code Quality:**
- [ ] No console errors/warnings
- [ ] Component prop types defined (TypeScript)
- [ ] Reusable components (avoid copy-paste)
- [ ] Clean component structure

---

## COMPONENT REUSE STRATEGY

**Build once, use everywhere:**

1. **FilterBar Component** (used in: LEADS, OUTREACH, CONTACTS, LENDERS)
   - Props: filters, onFilterChange, filterOptions
   - Renders checkboxes, dropdowns, text inputs

2. **SearchInput Component** (every page)
   - Props: placeholder, onSearch, debounceMs
   - Debounced onChange handler

3. **SortDropdown Component** (every page)
   - Props: sortOptions, currentSort, onSortChange
   - Shows column name + direction

4. **PaginationControl Component** (every page)
   - Props: currentPage, totalPages, onPageChange
   - Previous/Next + jump to page

5. **DataTable Component** (LEADS, LENDERS, APPLICATIONS)
   - Props: columns, rows, onRowClick, sortable
   - Handles headers, clickable rows

6. **DetailCard Component** (LEADS detail, CONTACT card, APPLICATION card)
   - Props: data, title, actions
   - Consistent layout across all types

7. **Modal Component** (Create Campaign, Add Lender, Confirm Delete)
   - Props: isOpen, title, children, onClose
   - Consistent styling

8. **Toast Notification Component** (Global)
   - Props: type (success/error/info/warning), message, duration
   - Used everywhere for feedback

---

## THEME COLORS

**Light Blue (Merchant Outreach):**
- Primary: #3B82F6 (blue-500)
- Secondary: #DBEAFE (blue-100)
- Accent: #1E40AF (blue-900)
- Background: #F0F9FF (blue-50)

**Light Green (Lenders):**
- Primary: #22C55E (green-500)
- Secondary: #DCFCE7 (green-100)
- Accent: #15803D (green-900)
- Background: #F0FDF4 (green-50)

**Neutral:**
- Gray: #6B7280
- Dark: #1F2937
- Light: #F9FAFB

---

## RULES

1. **Mobile-first** - Start mobile, enhance for desktop
2. **Accessible** - ARIA labels, keyboard navigation, color contrast
3. **Responsive** - Works at all sizes (375px to 2560px)
4. **Consistent** - Same components, same patterns, same colors
5. **Fast** - Debounce searches, paginate large lists, optimize renders
6. **User-friendly** - Clear errors, helpful placeholders, confirmation dialogs
7. **Coordinate with Claude** - Only on endpoint/data structure/color changes
8. **No hardcoding** - Use env vars, config, constants

---

## GO TIME

**Status:** Ready to execute  
**Current Phase:** 1 (DATA verification)  
**Next Phase:** 2 (LEADS) - immediately after Phase 1  
**Target Completion:** Oct 7-8, 2026

**Work non-stop alongside Claude. Build the UI that makes Operion's platform sing.**
