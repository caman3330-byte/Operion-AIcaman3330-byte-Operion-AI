#!/bin/bash

# Production Test Suite for Operion Acquisition & Research System
# Run this AFTER setting Vercel environment variables
# Usage: bash test-production.sh

set -e

PROD_URL="https://operion-ai-dashboard.vercel.app"
RESULTS_FILE="/tmp/operion-prod-test-results.txt"

echo "═══════════════════════════════════════════════════════════════" > $RESULTS_FILE
echo "OPERION PRODUCTION TEST RESULTS" >> $RESULTS_FILE
echo "Date: $(date)" >> $RESULTS_FILE
echo "═══════════════════════════════════════════════════════════════" >> $RESULTS_FILE
echo "" >> $RESULTS_FILE

# Test 1: Diagnostics Endpoint
echo "TEST 1: DATABASE HEALTH CHECK" | tee -a $RESULTS_FILE
echo "URL: $PROD_URL/api/data/diagnostics" >> $RESULTS_FILE
DIAG_RESPONSE=$(curl -s "$PROD_URL/api/data/diagnostics" 2>&1)
echo "Response: $DIAG_RESPONSE" >> $RESULTS_FILE

if echo "$DIAG_RESPONSE" | grep -q "migration_0044_applied.*true"; then
  echo "✅ PASS: Database migration 0044 applied" | tee -a $RESULTS_FILE
else
  echo "❌ FAIL: Migration not applied or endpoint blocked" | tee -a $RESULTS_FILE
fi
echo "" >> $RESULTS_FILE

# Test 2: Scheduler Endpoint
echo "TEST 2: SCHEDULER ENDPOINT" | tee -a $RESULTS_FILE
echo "URL: $PROD_URL/api/acquisition/google-places-scheduler" >> $RESULTS_FILE
SCHEDULER_RESPONSE=$(curl -s "$PROD_URL/api/acquisition/google-places-scheduler" 2>&1)
echo "Response: $SCHEDULER_RESPONSE" >> $RESULTS_FILE

if echo "$SCHEDULER_RESPONSE" | grep -q "metrics"; then
  DISCOVERED=$(echo "$SCHEDULER_RESPONSE" | grep -o '"businesses_discovered":[0-9]*' | grep -o '[0-9]*')
  INSERTED=$(echo "$SCHEDULER_RESPONSE" | grep -o '"new_businesses_inserted":[0-9]*' | grep -o '[0-9]*')
  echo "✅ PASS: Scheduler executed" | tee -a $RESULTS_FILE
  echo "   Discovered: $DISCOVERED" | tee -a $RESULTS_FILE
  echo "   Inserted: $INSERTED" | tee -a $RESULTS_FILE

  if [ "$INSERTED" -gt 0 ]; then
    echo "✅ PASS: Businesses inserted to Supabase" | tee -a $RESULTS_FILE
  else
    echo "⚠️  WARNING: Discovered but not inserted (RPC might be failing)" | tee -a $RESULTS_FILE
  fi
else
  echo "❌ FAIL: Scheduler endpoint not accessible or errored" | tee -a $RESULTS_FILE
fi
echo "" >> $RESULTS_FILE

# Test 3: Status Endpoint (requires auth)
echo "TEST 3: ACQUISITION STATUS" | tee -a $RESULTS_FILE
echo "URL: $PROD_URL/api/acquisition/status" >> $RESULTS_FILE
STATUS_RESPONSE=$(curl -s "$PROD_URL/api/acquisition/status" 2>&1)
echo "Response: $STATUS_RESPONSE" >> $RESULTS_FILE

if echo "$STATUS_RESPONSE" | grep -q "schedule"; then
  echo "✅ PASS: Status endpoint accessible (authenticated)" | tee -a $RESULTS_FILE
else
  echo "⚠️  WARNING: Status endpoint requires authentication (expected)" | tee -a $RESULTS_FILE
fi
echo "" >> $RESULTS_FILE

# Test 4: CSV Research Endpoint
echo "TEST 4: CSV RESEARCH ENDPOINT" | tee -a $RESULTS_FILE
echo "URL: $PROD_URL/api/data/csv-upload" >> $RESULTS_FILE
RESEARCH_RESPONSE=$(curl -s -X POST "$PROD_URL/api/data/csv-upload" \
  -H "Content-Type: multipart/form-data" 2>&1)
echo "Response: $RESEARCH_RESPONSE" >> $RESULTS_FILE

if echo "$RESEARCH_RESPONSE" | grep -q "unauthenticated"; then
  echo "✅ PASS: Endpoint exists (requires founder auth)" | tee -a $RESULTS_FILE
elif echo "$RESEARCH_RESPONSE" | grep -q "No file"; then
  echo "✅ PASS: Endpoint exists (file required)" | tee -a $RESULTS_FILE
else
  echo "⚠️  Check response for endpoint status" | tee -a $RESULTS_FILE
fi
echo "" >> $RESULTS_FILE

# Summary
echo "═══════════════════════════════════════════════════════════════" >> $RESULTS_FILE
echo "TEST COMPLETE" >> $RESULTS_FILE
echo "═══════════════════════════════════════════════════════════════" >> $RESULTS_FILE
echo "" >> $RESULTS_FILE

cat $RESULTS_FILE
echo ""
echo "Full results saved to: $RESULTS_FILE"
echo ""
echo "NEXT STEPS:"
echo "1. If diagnostics PASS: database is connected"
echo "2. If scheduler PASS and INSERTED > 0: acquisition works end-to-end"
echo "3. If scheduler PASS but INSERTED = 0: RPC/Supabase key issue"
echo "4. Check acquisition_prospects table for new records"
echo "5. Test CSV upload from dashboard /data/csv-research page"
