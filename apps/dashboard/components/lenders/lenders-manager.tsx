"use client";

import { useState } from "react";
import type { Lender } from "@operion/shared";
import { AddLenderModal } from "@/components/lenders/add-lender-modal";
import { LendersTable } from "@/components/lenders/lenders-table";

interface LendersManagerProps {
  initialLenders: Lender[];
}

type LenderCreatePayload = Omit<Lender, "id" | "created_at">;

export function LendersManager({ initialLenders }: LendersManagerProps) {
  const [lenders, setLenders] = useState<Lender[]>(initialLenders);
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreateLender(payload: LenderCreatePayload) {
    setIsCreating(true);
    try {
      const response = await fetch("/api/lenders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Unable to create lender");
      }

      const result = await response.json();
      setLenders((current) => [result.data, ...current]);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdateLender(id: string, payload: LenderCreatePayload) {
    const response = await fetch(`/api/lenders/${id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || "Unable to update lender");
    }

    const result = await response.json();
    setLenders((current) => current.map((lender) => (lender.id === id ? result.data : lender)));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Lenders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage lender criteria, pricing, active state, and webhook readiness.
          </p>
        </div>
        <AddLenderModal onCreate={handleCreateLender} isPending={isCreating} />
      </div>
      <LendersTable lenders={lenders} onUpdate={handleUpdateLender} />
    </div>
  );
}
