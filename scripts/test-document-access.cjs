const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the real route with isolated dependencies: no credentials or database.
const source = fs.readFileSync(path.join(__dirname, '../apps/dashboard/app/api/documents/[documentId]/signed-url/route.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let authorized = true;
let mimeType = 'application/pdf';
let fileName = 'statement.pdf';
let signedCalls = [];
let customerId = null;
let ownedApplicationId = null;
let documentApplicationId = 'application-one';
let documentUserId = 'customer-one';
let tokenApplicationId = null;
let ownershipChecks = [];
class AccessError extends Error {}
const dependencies = {
  'next/server': { NextResponse: { redirect: (url) => ({ url, headers: new Headers() }) } },
  '@/lib/auth': {
    requireInternalUser: async () => { if (!authorized) throw new AccessError(); },
    requireCustomer: async () => { if (!customerId) throw new AccessError(); return { id: customerId, role: 'customer' }; }
  },
  '@/lib/documents/processing': { getDocumentStorageBucket: () => 'private-documents' },
  '@/lib/errors': { AuthenticationError: AccessError, AuthorizationError: AccessError, NotFoundError: AccessError, handleRouteError: () => ({ status: 401 }) },
  '@/lib/portal/merchant-upload-auth': { validateMerchantUploadToken: async () => { if (!tokenApplicationId) throw new AccessError(); return { business_application_id: tokenApplicationId }; } },
  '@/lib/repositories/production': { productionRepository: {
    getDocument: async () => ({ storage_path: 'test/document', file_name: fileName, mime_type: mimeType, business_application_id: documentApplicationId, user_id: documentUserId }),
    getCustomerBusinessApplication: async (userId, applicationId) => {
      ownershipChecks.push([userId, applicationId]);
      if (userId !== customerId || applicationId !== ownedApplicationId) throw new AccessError();
      return { id: applicationId };
    }
  } },
  '@/lib/supabase/server': { getSupabaseAdmin: () => ({ storage: { from: () => ({ createSignedUrl: async (...args) => { signedCalls.push(args); return { data: { signedUrl: 'https://example.invalid/private-file' } }; } }) } }) }
};
const context = { exports: {}, require: (name) => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; } };
vm.runInNewContext(compiled, context);
const request = (query = '') => context.exports.GET({ nextUrl: new URL(`https://example.invalid/document${query}`) }, { params: Promise.resolve({ documentId: 'test-document' }) });
(async () => {
  let response = await request('?preview=1');
  assert.equal(signedCalls.at(-1)[2], undefined);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  await request();
  assert.equal(signedCalls.at(-1)[2].download, 'statement.pdf');
  mimeType = 'text/html'; fileName = 'document.html';
  await request('?preview=1');
  assert.equal(signedCalls.at(-1)[2].download, 'document.html');
  authorized = false;
  const callsBefore = signedCalls.length;
  response = await request('?preview=1');
  assert.equal(response.status, 401);
  assert.equal(signedCalls.length, callsBefore);

  customerId = 'customer-one';
  ownedApplicationId = 'application-one';
  response = await request();
  assert.equal(response.url, 'https://example.invalid/private-file');
  assert.deepEqual(ownershipChecks.at(-1), ['customer-one', 'application-one']);
  assert.equal(signedCalls.at(-1)[1], 300, 'private URLs expire after five minutes');

  ownedApplicationId = 'different-application';
  const beforeCrossApplication = signedCalls.length;
  response = await request();
  assert.equal(response.status, 401);
  assert.equal(signedCalls.length, beforeCrossApplication, 'customer cannot access another application');

  documentApplicationId = null;
  response = await request();
  assert.equal(response.url, 'https://example.invalid/private-file');
  documentUserId = 'different-customer';
  const beforeDifferentOwner = signedCalls.length;
  response = await request();
  assert.equal(response.status, 401);
  assert.equal(signedCalls.length, beforeDifferentOwner, 'legacy document owner must match');

  customerId = null;
  documentApplicationId = 'application-one';
  tokenApplicationId = 'application-one';
  response = await request('?token=mock-upload-session');
  assert.equal(response.url, 'https://example.invalid/private-file');
  tokenApplicationId = 'different-application';
  const beforeDifferentTokenApplication = signedCalls.length;
  response = await request('?token=mock-upload-session');
  assert.equal(response.status, 401);
  assert.equal(signedCalls.length, beforeDifferentTokenApplication, 'upload link must match document application');
  tokenApplicationId = null;
  response = await request('?token=mock-expired-session');
  assert.equal(response.status, 401);
  assert.equal(signedCalls.length, beforeDifferentTokenApplication, 'invalid or expired upload link must not sign');
  console.log('PASS: private PDF/download redirects; five-minute expiry; operator/customer/merchant-link access; cross-application, wrong-owner and invalid-link rejection. Mock-only; database writes: 0.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
