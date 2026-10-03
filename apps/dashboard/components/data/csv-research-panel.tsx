'use client';

import { useState, useCallback } from 'react';

interface ResearchBatch {
  batch_id: string;
  filename: string;
  total: number;
  pending: number;
  researched: number;
  failed: number;
  created_at: string;
}

interface ResearchProgress {
  batch_id: string;
  total: number;
  statuses: Record<string, number>;
  rows: Array<{
    row_number: number;
    status: string;
    score?: number;
    qualification?: string;
    error?: string;
  }>;
}

export function CSVResearchPanel() {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [batches, setBatches] = useState<ResearchBatch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<ResearchProgress | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleUpload = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      showNotification('error', 'Please upload a CSV file');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/data/csv-upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        showNotification('error', data.error || 'Upload failed');
        return;
      }

      showNotification('success', `Uploaded ${data.rows_imported} businesses. Research starting...`);

      // Refresh batch list
      await loadBatches();

      // Set selected batch to show progress
      setSelectedBatch({
        batch_id: data.batch_id,
        total: data.rows_imported,
        statuses: { pending: data.rows_imported },
        rows: [],
      });
    } catch (err) {
      showNotification('error', `Upload error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleUpload(files[0]!);
    }
  }, []);

  const loadBatches = async () => {
    try {
      const response = await fetch('/api/data/research-worker');
      if (response.ok) {
        const data = await response.json();
        setBatches(data.batches || []);
      }
    } catch (err) {
      console.error('Error loading batches:', err);
    }
  };

  const loadBatchProgress = async (batchId: string) => {
    try {
      const response = await fetch(`/api/data/research-worker?batch_id=${batchId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedBatch(data);
      }
    } catch (err) {
      console.error('Error loading progress:', err);
    }
  };

  const handleStartResearch = async () => {
    try {
      const response = await fetch('/api/data/research-worker', {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        showNotification('success', `Researched ${data.processed} businesses`);
        await loadBatches();
      } else {
        showNotification('error', 'Failed to start research');
      }
    } catch (err) {
      showNotification('error', `Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Notification */}
      {notification && (
        <div className={`p-4 rounded-lg ${notification.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {notification.message}
        </div>
      )}

      {/* Upload Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Upload Business Data</h3>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition ${
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-gray-50 hover:border-gray-400'
          }`}
        >
          <p className="text-gray-600 mb-2">Drag and drop your CSV or Excel file here</p>
          <p className="text-gray-500 text-sm mb-4">or</p>
          <label className="inline-block">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) handleUpload(file);
              }}
              disabled={isUploading}
              className="hidden"
            />
            <button
              onClick={(e) => {
                e.currentTarget.parentElement?.querySelector('input')?.click();
              }}
              disabled={isUploading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isUploading ? 'Uploading...' : 'Choose File'}
            </button>
          </label>
          <p className="text-gray-500 text-xs mt-4">
            Supports: CSV (.csv)
          </p>
        </div>
      </div>

      {/* Research Queue Section */}
      {batches.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Research Queue</h3>
            <button
              onClick={handleStartResearch}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
            >
              Start Research Now
            </button>
          </div>

          <div className="space-y-3">
            {batches.map((batch) => (
              <div
                key={batch.batch_id}
                onClick={() => loadBatchProgress(batch.batch_id)}
                className="p-4 border border-gray-200 rounded cursor-pointer hover:bg-gray-50"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-gray-900">{batch.filename}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(batch.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{batch.total} businesses</p>
                  </div>
                </div>

                <div className="flex gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Pending:</span>
                    <span className="ml-1 font-medium text-yellow-600">{batch.pending}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Researched:</span>
                    <span className="ml-1 font-medium text-green-600">{batch.researched}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Failed:</span>
                    <span className="ml-1 font-medium text-red-600">{batch.failed}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all"
                    style={{
                      width: `${batch.total > 0 ? (batch.researched / batch.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Progress Section */}
      {selectedBatch && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Detailed Progress</h3>

          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 p-4 rounded">
              <p className="text-gray-600 text-sm">Total</p>
              <p className="text-2xl font-bold">{selectedBatch.total}</p>
            </div>
            <div className="bg-yellow-50 p-4 rounded">
              <p className="text-gray-600 text-sm">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">
                {selectedBatch.statuses['pending'] || 0}
              </p>
            </div>
            <div className="bg-green-50 p-4 rounded">
              <p className="text-gray-600 text-sm">Researched</p>
              <p className="text-2xl font-bold text-green-600">
                {selectedBatch.statuses['researched'] || 0}
              </p>
            </div>
            <div className="bg-red-50 p-4 rounded">
              <p className="text-gray-600 text-sm">Failed</p>
              <p className="text-2xl font-bold text-red-600">
                {selectedBatch.statuses['failed'] || 0}
              </p>
            </div>
          </div>

          {selectedBatch.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Row</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-left py-2 px-2">Score</th>
                    <th className="text-left py-2 px-2">Qualification</th>
                    <th className="text-left py-2 px-2">Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedBatch.rows.map((row) => (
                    <tr key={row.row_number} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-2">{row.row_number}</td>
                      <td className="py-2 px-2">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          row.status === 'researched' ? 'bg-green-100 text-green-800' :
                          row.status === 'researching' ? 'bg-blue-100 text-blue-800' :
                          row.status === 'failed' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        {row.score !== undefined ? (
                          <span className="font-semibold">{row.score}/100</span>
                        ) : '-'}
                      </td>
                      <td className="py-2 px-2 text-gray-600">
                        {row.qualification || '-'}
                      </td>
                      <td className="py-2 px-2 text-red-600 text-xs max-w-xs truncate" title={row.error}>
                        {row.error}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
