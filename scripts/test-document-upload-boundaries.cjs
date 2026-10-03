const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the upload route and its real file validation against mocked storage,
// authorization and repositories. Never load environment files or credentials.
class ValidationError extends Error {}
const effects = [];
let actor = null;
let ownerAllowed = false;
let tokenApplicationId = null;
const application = { id: 'application-one', user_id: 'customer-one', contact_email: 'test@example.invalid', lead_id: null, status: 'awaiting_documents', metadata: {} };
const write = name => async value => { effects.push({ name, value }); return { id: `${name}-one`, ...value }; };
const repository = {
  async getCustomerBusinessApplication(userId, id) {
    if (!ownerAllowed || userId !== application.user_id || id !== application.id) throw new ValidationError();
    return application;
  },
  async getBusinessApplication(id) { assert.equal(id, application.id); return application; },
  async getDocumentByType() { return null; },
  createDocument: write('document'),
  updateDocument: async () => { throw new Error('Unexpected placeholder update'); },
  updateBusinessApplication: async (id, value) => { assert.equal(id, application.id); effects.push({ name: 'application', value }); },
  createCrmActivity: write('crm'),
  createAiTask: write('task'),
  createAiTaskLog: write('task-log'),
  createAuditLog: write('audit')
};
const dependencies = {
  buffer: { Buffer },
  'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
  '@/lib/auth': { requireCustomer: async () => { if (!actor) throw new ValidationError(); return actor; } },
  '@/lib/audit': { writeAuditLog: write('audit-log') },
  '@/lib/errors': { ValidationError, handleRouteError: error => ({ status: error instanceof ValidationError ? 400 : 500 }) },
  '@/lib/integrations/email-automation': { enqueueFundingEmail: write('mock-email') },
  '@/lib/portal/merchant-upload-auth': { validateMerchantUploadToken: async () => {
    if (!tokenApplicationId) throw new ValidationError();
    return { business_application_id: tokenApplicationId, email: 'test@example.invalid', application };
  } },
  '@/lib/repositories/production': { productionRepository: repository },
  '@/lib/supabase/server': { getSupabaseAdmin: () => ({ storage: { from: bucket => ({
    upload: async (storagePath, buffer, options) => {
      effects.push({ name: 'storage', bucket, storagePath, size: buffer.length, options });
      return { error: null };
    }
  }) } }) }
};
function load(file) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, Blob, require(name) { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; } };
  vm.runInNewContext(compiled, context);
  return context.exports;
}
dependencies['@/lib/documents/processing'] = load('apps/dashboard/lib/documents/processing.ts');
const { POST } = load('apps/dashboard/app/api/documents/upload/route.ts');
function request({ file = new File(['test-data'], 'statement.pdf', { type: 'application/pdf' }), id = application.id, token = '', documentType = 'bank_statements' } = {}) {
  const data = new Map([['file', file], ['business_application_id', id], ['merchant_token', token], ['document_type', documentType]]);
  return { headers: new Headers({ 'content-type': 'multipart/form-data; boundary=mock' }), formData: async () => data };
}
async function denied(input) {
  effects.length = 0;
  assert.equal((await POST(request(input))).status, 400);
  assert.equal(effects.length, 0, 'Rejected upload must not call storage, repositories or email');
}

(async () => {
  await denied();
  actor = { id: 'customer-one', email: 'test@example.invalid', role: 'customer' };
  await denied();
  ownerAllowed = true;
  await denied({ id: 'different-application' });
  await denied({ file: new File(['bad'], 'statement.html', { type: 'text/html' }) });
  await denied({ file: new File([], 'empty.pdf', { type: 'application/pdf' }) });
  const oversized = new File(['test'], 'large.pdf', { type: 'application/pdf' });
  Object.defineProperty(oversized, 'size', { value: 50 * 1024 * 1024 + 1 });
  await denied({ file: oversized });
  await denied({ documentType: 'unsupported-type' });

  actor = null;
  tokenApplicationId = 'different-application';
  await denied({ token: 'mock-link' });
  tokenApplicationId = null;
  await denied({ token: 'mock-expired-link' });
  tokenApplicationId = application.id;
  const response = await POST(request({ token: 'mock-link' }));
  assert.equal(response.status, 201);
  const storage = effects.find(effect => effect.name === 'storage');
  assert.equal(storage.bucket, 'underwriting-documents');
  assert.ok(storage.storagePath.startsWith(`${application.id}/bank_statements/`));
  assert.equal(storage.options.upsert, false);
  const document = effects.find(effect => effect.name === 'document').value;
  assert.equal(document.business_application_id, application.id);
  assert.equal(document.user_id, application.user_id);
  assert.equal(document.status, 'uploaded');
  assert.equal(document.processing_status, 'pending');
  assert.equal(document.uploaded_by_role, 'merchant_magic_link');
  assert.equal(effects.find(effect => effect.name === 'application').value.status, 'documents_uploaded');
  assert.equal(effects.find(effect => effect.name === 'task').value.status, 'blocked');
  assert.equal(effects.find(effect => effect.name === 'task').value.task_type, 'document_processing');
  console.log('PASS: upload authorization, application binding, file type/size checks and private storage/lifecycle/blocked processing contract. All storage, database and email effects mocked; remote writes: 0.');
})().catch(error => { console.error(error); process.exitCode = 1; });
