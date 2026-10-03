import { CSVResearchPanel } from '@/components/data/csv-research-panel';
import { getInternalPageAccess, ProtectedPageRedirect } from '@/components/layout/protected-page';

export const dynamic = 'force-dynamic';

export default async function CSVResearchPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;
  if (!['founder', 'admin', 'super_admin'].includes(access.role))
    return <ProtectedPageRedirect to="/unauthorized" reason="Founder or administrator access required" />;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">CSV Research</p>
        <h1 className="mt-1 text-2xl font-semibold">Business Research Pipeline</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload business data and let Operion research and qualify each prospect.
        </p>
      </header>

      <CSVResearchPanel />

      <section className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-4">How it Works</h3>
        <ol className="space-y-3 text-blue-800">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-200 flex items-center justify-center font-semibold text-sm">1</span>
            <span><strong>Upload CSV or Excel</strong> - Contains business names, addresses, contact info, etc.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-200 flex items-center justify-center font-semibold text-sm">2</span>
            <span><strong>Research</strong> - System searches Google Places and verifies each business</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-200 flex items-center justify-center font-semibold text-sm">3</span>
            <span><strong>Qualify</strong> - Each business is scored and qualified (Strong/Possible/Weak/Not a Fit)</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-200 flex items-center justify-center font-semibold text-sm">4</span>
            <span><strong>Review</strong> - Results are added to your leads database for review</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-200 flex items-center justify-center font-semibold text-sm">5</span>
            <span><strong>No Auto Outreach</strong> - All leads remain in research queue until you manually approve</span>
          </li>
        </ol>
      </section>

      <section className="bg-green-50 border border-green-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-green-900 mb-3">File Format</h3>
        <p className="text-green-800 mb-3">
          Your file should contain business information. Common column names are automatically recognized:
        </p>
        <div className="grid grid-cols-2 gap-4 text-sm text-green-800">
          <div>
            <strong>Business Info:</strong>
            <ul className="list-disc list-inside mt-2">
              <li>Business Name / Company</li>
              <li>Industry / Category</li>
              <li>Address / Street</li>
            </ul>
          </div>
          <div>
            <strong>Contact Info:</strong>
            <ul className="list-disc list-inside mt-2">
              <li>Phone / Telephone</li>
              <li>Email / Contact Email</li>
              <li>Website / URL</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
