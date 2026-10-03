#!/bin/bash

echo "🚀 Operion AI /data Endpoint Setup"
echo "===================================="
echo ""
echo "Step 1: Get your Supabase Public Key"
echo "-----------------------------------"
echo ""
echo "1. Open: https://app.supabase.com/project/dstqbiccseijydgsvlgj/settings/api"
echo "2. Look for 'Project API Keys' section"
echo "3. Copy the 'anon' / 'public' key (NOT the service_role key)"
echo "4. Paste it when prompted below"
echo ""
echo "The key will be in one of these formats:"
echo "  - sb_publishable_... (newer format)"
echo "  - eyJ... (JWT format - older)"
echo ""
echo "Enter your NEXT_PUBLIC_SUPABASE_ANON_KEY:"
read -p "> " ANON_KEY

if [ -z "$ANON_KEY" ]; then
  echo "❌ No key provided. Exiting."
  exit 1
fi

# Validate key format
if [[ ! "$ANON_KEY" =~ ^(sb_publishable_|eyJ) ]]; then
  echo "⚠️  Warning: Key doesn't start with expected prefix"
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Update .env.local
echo ""
echo "Step 2: Updating environment files..."
sed -i "s|NEXT_PUBLIC_SUPABASE_ANON_KEY=.*|NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY|g" .env.local
sed -i "s|NEXT_PUBLIC_SUPABASE_ANON_KEY=.*|NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY|g" apps/dashboard/.env.local

echo "✅ Updated .env.local files"

# Kill existing dev server
echo ""
echo "Step 3: Restarting dev server..."
pkill -f "next dev" || true
pkill -f "npm run dev" || true
sleep 2

# Start dev server
npm run dev > dev-server.log 2>&1 &
SERVER_PID=$!
echo "✅ Dev server started (PID: $SERVER_PID)"

# Wait for server to start
sleep 10

# Test endpoints
echo ""
echo "Step 4: Testing endpoints..."
echo ""

echo "Testing /api/data..."
RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3001/api/data)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
echo "HTTP Status: $HTTP_CODE"

echo ""
echo "Testing /data..."
RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3001/data)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
echo "HTTP Status: $HTTP_CODE"
if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✅ /data endpoint working!"
else
  echo "❌ /data returned status $HTTP_CODE"
fi

echo ""
echo "Testing /data/manual-upload..."
RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3001/data/manual-upload)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
echo "HTTP Status: $HTTP_CODE"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Open http://localhost:3001/data in your browser"
echo "2. Verify the 4 data cards display correctly"
echo "3. Check that acquisition records are loaded"
echo ""
echo "Server logs: cat dev-server.log"
echo "To stop the server: kill $SERVER_PID"
