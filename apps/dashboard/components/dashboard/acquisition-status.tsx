'use client';

import { useEffect, useState } from 'react';

interface AcquisitionStatus {
  enabled: boolean;
  nextRunAt: string;
  schedule: string;
  timezone: string;
  totalAcquired: number;
  acquiredLast24h: number;
  lastRun: {
    runAt: string;
    searchesExecuted: number;
    discovered: number;
    inserted: number;
    duplicates: number;
    errors: number;
  } | null;
}

interface ResearchMetrics {
  total: number;
  pending: number;
  researching: number;
  completed: number;
  qualified: number;
  notAFit: number;
  errors: number;
}

export function AcquisitionStatus() {
  const [acquisition, setAcquisition] = useState<AcquisitionStatus | null>(null);
  const [research, setResearch] = useState<ResearchMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const [acqRes, resRes] = await Promise.all([
          fetch('/api/acquisition/status'),
          fetch('/api/data/research-worker')
        ]);

        if (acqRes.ok) {
          const acqData = await acqRes.json();
          setAcquisition(acqData);
        }

        if (resRes.ok) {
          const resData = await resRes.json();
          // Calculate totals from batches
          const totalMetrics = resData.batches?.reduce((acc: any, batch: any) => ({
            total: acc.total + batch.total,
            pending: acc.pending + batch.pending,
            completed: acc.completed + batch.researched,
            errors: acc.errors + (batch.failed || 0)
          }), { total: 0, pending: 0, completed: 0, errors: 0 }) || { total: 0, pending: 0, completed: 0, errors: 0 };
          setResearch(totalMetrics);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load status');
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="text-gray-500">Loading acquisition status...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Automated Acquisition Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Automated Acquisition</h3>

        {acquisition ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-3 rounded">
                <p className="text-gray-600 text-sm">System Status</p>
                <p className="text-lg font-bold text-blue-600">
                  {acquisition.enabled ? '🟢 ACTIVE' : '🔴 DISABLED'}
                </p>
              </div>

              <div className="bg-purple-50 p-3 rounded">
                <p className="text-gray-600 text-sm">Next Run</p>
                <p className="text-sm font-semibold">{acquisition.nextRunAt}</p>
              </div>

              <div className="bg-green-50 p-3 rounded">
                <p className="text-gray-600 text-sm">Total Acquired</p>
                <p className="text-2xl font-bold text-green-600">{acquisition.totalAcquired}</p>
              </div>

              <div className="bg-green-50 p-3 rounded">
                <p className="text-gray-600 text-sm">Last 24 Hours</p>
                <p className="text-2xl font-bold text-green-600">{acquisition.acquiredLast24h}</p>
              </div>
            </div>

            {acquisition.lastRun && (
              <div className="border-t pt-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">Last Run Details</p>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-gray-600">Run Time</p>
                    <p className="font-semibold">{new Date(acquisition.lastRun.runAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Searched</p>
                    <p className="font-semibold text-blue-600">{acquisition.lastRun.searchesExecuted}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Discovered</p>
                    <p className="font-semibold text-purple-600">{acquisition.lastRun.discovered}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Inserted</p>
                    <p className="font-semibold text-green-600">{acquisition.lastRun.inserted}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Duplicates</p>
                    <p className="font-semibold text-yellow-600">{acquisition.lastRun.duplicates}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Errors</p>
                    <p className="font-semibold text-red-600">{acquisition.lastRun.errors}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-gray-50 p-3 rounded text-xs text-gray-600">
              <p>Schedule: {acquisition.schedule} UTC</p>
              <p>Timezone: {acquisition.timezone}</p>
            </div>
          </div>
        ) : (
          <div className="text-gray-500">Unable to load acquisition status</div>
        )}
      </div>

      {/* Research Pipeline Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">CSV Research Pipeline</h3>

        {research ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-gray-600 text-sm">Total Uploaded</p>
                <p className="text-2xl font-bold text-gray-900">{research.total}</p>
              </div>

              <div className="bg-yellow-50 p-3 rounded">
                <p className="text-gray-600 text-sm">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{research.pending}</p>
              </div>

              <div className="bg-blue-50 p-3 rounded">
                <p className="text-gray-600 text-sm">Researching</p>
                <p className="text-2xl font-bold text-blue-600">{research.researching}</p>
              </div>

              <div className="bg-green-50 p-3 rounded">
                <p className="text-gray-600 text-sm">Completed</p>
                <p className="text-2xl font-bold text-green-600">{research.completed}</p>
              </div>

              <div className="bg-teal-50 p-3 rounded">
                <p className="text-gray-600 text-sm">Qualified Leads</p>
                <p className="text-2xl font-bold text-teal-600">{research.qualified}</p>
              </div>

              <div className="bg-orange-50 p-3 rounded">
                <p className="text-gray-600 text-sm">Not a Fit</p>
                <p className="text-2xl font-bold text-orange-600">{research.notAFit}</p>
              </div>
            </div>

            {research.errors > 0 && (
              <div className="bg-red-50 p-3 rounded border border-red-200">
                <p className="text-sm text-red-600">
                  ⚠️ {research.errors} research errors - check failed batches
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-500">No research data yet</div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}
