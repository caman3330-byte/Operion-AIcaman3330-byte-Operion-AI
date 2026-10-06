# Operion Platform API Documentation

**Version:** 1.0.0  
**Last Updated:** October 6, 2026  
**Status:** Complete & Tested

---

## Authentication

All endpoints require `requireFounder` authentication unless otherwise noted.

```typescript
import { requireFounder } from '@/lib/auth';
const actor = await requireFounder(request);
```

---

## PHASE 1: DATA RESEARCH APIs

### Upload Preview
**POST** `/api/data/csv-preview`

Preview file without writing to database.

**Request:**
```
Content-Type: multipart/form-data
file: <CSV or XLSX file>
```

**Response:**
```json
{
  "preview_id": "sha256hash...",
  "filename": "10-4-2026.xlsx",
  "rows_detected": 21,
  "valid_rows": 20,
  "invalid_rows": 0,
  "duplicate_rows": 0,
  "missing_email": 5,
  "missing_phone": 3,
  "ready_for_outreach": 15,
  "sample_rows": [
    {
      "row_number": 1,
      "business_name": "Acme Corp",
      "address": "123 Main St",
      "owner_name": "John Smith",
      "status": "valid"
    }
  ],
  "summary": "21 rows detected • 20 valid • 0 invalid • 0 duplicates"
}
```

**Notes:**
- Performs NO database writes
- Returns preview_id for confirmation
- Detects existing duplicates via identity_key
- Preserves owner names from positional columns

---

### Confirm & Import
**POST** `/api/data/csv-upload`

Import file to database after preview confirmation.

**Request:**
```
Content-Type: multipart/form-data
file: <CSV or XLSX file>
confirm: "true"
preview_id: "<hash from preview>"
```

**Response:**
```json
{
  "success": true,
  "batch_id": "uuid-...",
  "batch_code": "DATA-20261005-abc123",
  "message": "Confirmed 21 rows for DATA research: 20 valid, 0 invalid, 0 duplicates. No leads or outreach were created.",
  "counts": {
    "total": 21,
    "valid": 20,
    "invalid": 0,
    "duplicate": 0,
    "missing_email": 5,
    "missing_phone": 3
  }
}
```

**Error Cases:**
- `400`: No file or invalid format
- `409`: preview_id mismatch (exact hash required)
- `500`: Database error

**Guarantees:**
- ✅ Only creates acquisition_prospects (no leads)
- ✅ Only creates acquisition_import_rows (no applications)
- ✅ No automatic lead creation
- ✅ No email sending
- ✅ No outreach campaigns

---

## PHASE 2: LEADS APIs

### List Leads
**GET** `/api/leads`

**Query Parameters:**
- `page` (number, default: 1)
- `page_size` (number, default: 25, max: 100)
- `status` (string: imported|qualified|outreach_ready|sent|replied)
- `enrichment_status` (string: pending|enriching|enriched|failed)
- `q` (string: search term)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid-...",
      "acquisition_prospect_id": "uuid-...",
      "status": "qualified",
      "enrichment_score": 85,
      "enrichment_status": "enriched",
      "qualified_at": "2026-10-04T12:00:00Z",
      "created_at": "2026-10-01T10:00:00Z",
      "acquisition_prospects": {
        "id": "uuid-...",
        "business_name": "Acme Corp",
        "address": "123 Main St",
        "city": "Denver",
        "state": "CO",
        "zip": "80202",
        "phone": "(303) 555-1234",
        "email": "john@acme.com",
        "website_url": "acme.com",
        "industry": "Retail",
        "owner_name": "John Smith"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 25,
    "total": 247,
    "total_pages": 10
  }
}
```

---

### Get Lead Detail
**GET** `/api/leads/{id}`

**Response:**
```json
{
  "lead": {
    "id": "uuid-...",
    "status": "qualified",
    "enrichment_score": 85
  },
  "outreach_history": [
    {
      "id": "uuid-...",
      "campaign_id": "uuid-...",
      "sent_at": "2026-10-05T14:00:00Z",
      "opened_at": "2026-10-05T14:15:00Z",
      "clicked_at": "2026-10-05T14:30:00Z"
    }
  ],
  "distributions": [...]
}
```

---

### Create Lead
**POST** `/api/leads`

**Request:**
```json
{
  "acquisition_prospect_id": "uuid-..."
}
```

**Response:**
```json
{
  "id": "uuid-...",
  "acquisition_prospect_id": "uuid-...",
  "status": "imported",
  "enrichment_status": "pending",
  "enrichment_score": 0,
  "created_at": "2026-10-06T00:00:00Z"
}
```

---

### Qualify Lead
**POST** `/api/leads/{id}/qualify`

Mark lead as outreach_ready.

**Request:**
```json
{
  "reason": "High qualification score" (optional)
}
```

**Response:**
```json
{
  "id": "uuid-...",
  "status": "outreach_ready",
  "qualified_at": "2026-10-06T00:00:00Z"
}
```

---

### Update Lead
**PATCH** `/api/leads/{id}`

**Request:**
```json
{
  "status": "qualified",
  "enrichment_score": 85,
  "enrichment_status": "enriched"
}
```

---

## PHASE 3: MERCHANT OUTREACH APIs

### Create Campaign
**POST** `/api/outreach/campaigns`

**Request:**
```json
{
  "name": "Fall Funding Drive",
  "template_id": "light-blue-funding",
  "lead_ids": ["uuid-...", "uuid-..."],
  "scheduled_at": "2026-10-07T09:00:00Z" (optional, send immediately if omitted)
}
```

**Response:**
```json
{
  "id": "uuid-...",
  "name": "Fall Funding Drive",
  "status": "draft",
  "total_recipients": 47,
  "created_at": "2026-10-06T00:00:00Z"
}
```

---

### List Campaigns
**GET** `/api/outreach/campaigns`

**Query Parameters:**
- `page`, `page_size`, `status` (draft|scheduled|sending|sent|paused)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid-...",
      "name": "Fall Funding Drive",
      "status": "sent",
      "total_recipients": 47,
      "sent_count": 47,
      "opened_count": 20,
      "clicked_count": 8,
      "replied_count": 2,
      "bounced_count": 0
    }
  ],
  "pagination": {...}
}
```

---

### Send Campaign
**POST** `/api/outreach/campaigns/{id}/send`

Send 50+ emails per day with rate limiting.

**Request:**
```json
{
  "confirm": true
}
```

**Response:**
```json
{
  "id": "uuid-...",
  "status": "sending",
  "sent_count": 47,
  "will_send_count": 47,
  "estimated_completion": "2026-10-06T01:30:00Z"
}
```

---

### Get Campaign Detail
**GET** `/api/outreach/campaigns/{id}`

**Response:**
```json
{
  "id": "uuid-...",
  "name": "Fall Funding Drive",
  "status": "sent",
  "total_recipients": 47,
  "sent_count": 47,
  "opened_count": 20,
  "clicked_count": 8,
  "replied_count": 2,
  "bounced_count": 0,
  "emails": [
    {
      "id": "uuid-...",
      "recipient_email": "john@acme.com",
      "status": "opened",
      "sent_at": "2026-10-05T14:00:00Z",
      "opened_at": "2026-10-05T14:15:00Z"
    }
  ],
  "applications": [
    {
      "id": "uuid-...",
      "applicant_name": "John Smith",
      "submitted_at": "2026-10-05T14:30:00Z",
      "funding_needed": 50000,
      "monthly_revenue": 200000
    }
  ]
}
```

---

### Get Campaign Replies
**GET** `/api/outreach/replies`

**Query Parameters:**
- `campaign_id` (optional)
- `page`, `page_size`

**Response:**
```json
{
  "data": [
    {
      "id": "uuid-...",
      "campaign_id": "uuid-...",
      "from_email": "john@acme.com",
      "subject": "Interested in funding",
      "body": "Yes, we'd like to apply...",
      "received_at": "2026-10-05T14:30:00Z"
    }
  ]
}
```

---

## PHASE 4: CONTACTS APIs

### List Contacts
**GET** `/api/contacts`

Only shows prospects marked as interested.

**Query Parameters:**
- `page`, `page_size`
- `q` (search)
- `industry`, `state` (filters)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid-...",
      "lead_id": "uuid-...",
      "status": "interested",
      "interest_reason": "Replied to funding email",
      "interested_at": "2026-10-04T14:00:00Z",
      "business_name": "Acme Corp",
      "contact_name": "John Smith",
      "phone": "(303) 555-1234",
      "email": "john@acme.com"
    }
  ],
  "pagination": {...}
}
```

---

### Mark Lead Interested
**POST** `/api/leads/{id}/mark-interested`

Move from leads to contacts.

**Request:**
```json
{
  "reason": "Replied to funding email" (optional)
}
```

**Response:**
```json
{
  "id": "uuid-...",
  "status": "interested",
  "interested_at": "2026-10-06T00:00:00Z"
}
```

---

### Mark Contact Not Interested
**POST** `/api/contacts/{id}/mark-not-interested`

Move back to leads with not_interested flag.

**Request:**
```json
{
  "reason": "No response after 3 follow-ups" (optional)
}
```

**Response:**
```json
{
  "id": "uuid-...",
  "status": "not_interested",
  "not_interested_at": "2026-10-06T00:00:00Z"
}
```

---

## PHASE 5: LENDERS APIs

### List Lenders
**GET** `/api/lenders`

**Query Parameters:**
- `page`, `page_size`
- `status` (active|inactive)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid-...",
      "name": "Quick Fund Inc",
      "email": "hello@quickfund.com",
      "phone": "(800) 555-0001",
      "industry_focus": ["Retail", "Technology"],
      "max_loan_amount": 500000,
      "min_monthly_revenue": 50000,
      "status": "active",
      "is_acquired": true,
      "acquired_date": "2026-09-01",
      "created_at": "2026-09-01"
    }
  ],
  "pagination": {...}
}
```

---

### Create Lender
**POST** `/api/lenders`

**Request:**
```json
{
  "name": "Quick Fund Inc",
  "email": "hello@quickfund.com",
  "phone": "(800) 555-0001",
  "industry_focus": ["Retail", "Technology"],
  "max_loan_amount": 500000,
  "min_monthly_revenue": 50000
}
```

**Response:** Lender object

---

### Edit Lender
**PATCH** `/api/lenders/{id}`

**Request:**
```json
{
  "max_loan_amount": 750000,
  "status": "active"
}
```

---

### Delete Lender
**DELETE** `/api/lenders/{id}`

Soft delete (status → inactive).

---

### List Applications
**GET** `/api/applications`

**Query Parameters:**
- `lender_id` (filter by lender)
- `status` (draft|sent|pending|approved|rejected)
- `page`, `page_size`

**Response:**
```json
{
  "data": [
    {
      "id": "uuid-...",
      "contact_id": "uuid-...",
      "lender_id": "uuid-...",
      "applicant_name": "John Smith",
      "business_name": "Acme Corp",
      "funding_needed": 50000,
      "monthly_revenue": 200000,
      "status": "draft",
      "sent_at": null,
      "created_at": "2026-10-05T14:30:00Z"
    }
  ]
}
```

---

### Bulk Send Applications
**POST** `/api/applications/bulk-send`

Send 30-40 applications to lender as PDF/Word.

**Request:**
```json
{
  "lender_id": "uuid-...",
  "application_ids": ["uuid-...", "uuid-...", ...],
  "format": "pdf" | "word"
}
```

**Response:**
```json
{
  "lender_id": "uuid-...",
  "sent_count": 30,
  "document_url": "https://...",
  "sent_at": "2026-10-06T00:00:00Z",
  "message": "Sent 30 applications to Quick Fund Inc"
}
```

---

## PHASE 6: GLOBAL APIs

### Settings
**GET** `/api/settings`

**Response:**
```json
{
  "merchant_email_from": "operion-merchant@example.com",
  "lender_email_from": "operion-lenders@example.com",
  "app_email_from": "operion-apps@example.com",
  "theme": "light"
}
```

**PATCH** `/api/settings`

**Request:**
```json
{
  "merchant_email_from": "new-email@example.com",
  "theme": "dark"
}
```

---

### AI Chat
**POST** `/api/chat`

Semantic search + Claude response.

**Request:**
```json
{
  "message": "How many leads in California?"
}
```

**Response:**
```json
{
  "response": "You have 87 leads in California. Of those, 62 are qualified and 41 are ready for outreach. Would you like to see a breakdown by industry?"
}
```

---

### SendGrid Webhook
**POST** `/api/webhooks/sendgrid`

*No authentication required.*

**Request (SendGrid format):**
```json
[
  {
    "event": "delivered",
    "email": "john@acme.com",
    "timestamp": 1609459200
  }
]
```

**Response:**
```json
{
  "processed": 1
}
```

---

## Error Handling

All errors return standard JSON format:

```json
{
  "error": "User-facing error message"
}
```

**Status Codes:**
- `200`: Success
- `201`: Created
- `400`: Bad request (validation error)
- `404`: Not found
- `409`: Conflict (e.g., hash mismatch)
- `500`: Server error

---

## Rate Limiting

- Email blast: 100 emails/second (SendGrid limit)
- API calls: No limit for founder-authenticated users
- Webhook: No limit (internal)

---

## Best Practices

1. **Always check response status code**
2. **Validate all request data before sending**
3. **Use pagination for large result sets**
4. **Store preview_id during multi-step flows**
5. **Implement retry logic with exponential backoff**
6. **Monitor webhook delivery for email events**
7. **Log all founder actions for audit trail**

---

## Testing Endpoints

All endpoints tested and working. Use Preview deployment URL for runtime verification.

**Preview URL:** https://operion-ai-dashboard-lerqajne0-operion-ai-s-projects.vercel.app

---

**Documentation Last Updated:** October 6, 2026  
**All 5 Phases Implemented:** ✅ Complete
