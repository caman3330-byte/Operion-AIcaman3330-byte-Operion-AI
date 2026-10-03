"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

interface ProviderStatus {
  key: string;
  label: string;
  configured: boolean;
}

export function AcquireData({ onAcquired }: { onAcquired: () => void }) {
  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [limit, setLimit] = useState("10");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);

  useEffect(() => {
    fetch("/api/data/providers")
      .then((res) => res.json())
      .then((data) => setProviders(data.providers ?? []))
      .catch(() => setProviders([]))
      .finally(() => setProvidersLoading(false));
  }, []);

  const configuredProviders = providers.filter((p) => p.configured);
  const allProvidersConfigured = configuredProviders.length > 0;

  async function handleAcquire(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);

    try {
      if (!source) throw new Error("Please select a data source");
      if (!query.trim()) throw new Error("Please enter a search query");

      const response = await fetch("/api/data/acquire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          query: query.trim(),
          location: location.trim() || undefined,
          limit: Math.max(1, Math.min(20, parseInt(limit) || 10))
        })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : payload.error?.message ?? "Acquisition could not be completed"
        );
      }

      const discovered = payload.data?.counts?.discovered ?? 0;
      setMessage(`Successfully discovered ${discovered} businesses. Check the Acquired businesses table to review.`);

      setQuery("");
      setLocation("");
      onAcquired();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Acquisition failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!allProvidersConfigured) {
    return (
      <div className="space-y-6">
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="text-amber-900 dark:text-amber-100">AI acquisition is not configured</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-amber-800 dark:text-amber-200">
            <p>To enable AI-powered business discovery, add an acquisition provider:</p>
            <ul className="list-inside list-disc space-y-2 ml-2">
              <li><strong>Google Places:</strong> Set GOOGLE_PLACES_API_KEY environment variable</li>
              <li><strong>Apollo:</strong> Set APOLLO_API_KEY environment variable</li>
            </ul>
            <p className="text-xs mt-3 opacity-75">Once configured, you can discover businesses by entering a search query and selecting a data source.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Find businesses using AI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAcquire} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="source">Data Source</Label>
                <Select value={source} onChange={(e) => setSource(e.target.value)} disabled={loading}>
                  <option value="">Select a source…</option>
                  {configuredProviders.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="query">Search Query</Label>
                <Input
                  id="query"
                  placeholder="e.g., Roofing contractors in Dallas"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={loading}
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location (optional)</Label>
                <Input
                  id="location"
                  placeholder="e.g., Texas"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={loading}
                  maxLength={120}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="limit">Max results</Label>
                <Select value={limit} onChange={(e) => setLimit(e.target.value)} disabled={loading}>
                  {[5, 10, 15, 20].map((n) => (
                    <option key={n} value={n}>
                      {n} results
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {message ? (
              <div role="alert" className="rounded-md border border-green-500/30 bg-green-50/50 p-3 text-sm text-green-700 dark:bg-green-950/20 dark:text-green-400">
                {message}
              </div>
            ) : null}

            {error ? (
              <div role="alert" className="flex items-center gap-2 rounded-md border border-destructive/30 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            ) : null}

            <Button type="submit" disabled={loading || !source || !query.trim()}>
              <Search className="h-4 w-4" />
              {loading ? "Finding businesses…" : "Find businesses"}
            </Button>
          </form>

          <div className="rounded-md bg-blue-50/50 p-3 text-xs text-blue-700 dark:bg-blue-950/20 dark:text-blue-400">
            <p className="font-medium mb-1">How it works</p>
            <ul className="list-inside list-disc space-y-0.5">
              <li>Enter your search criteria and select a data source</li>
              <li>Operion queries the source for matching businesses</li>
              <li>Results are added to &quot;Acquired businesses&quot; below</li>
              <li>All businesses are enriched and checked for duplicates</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
