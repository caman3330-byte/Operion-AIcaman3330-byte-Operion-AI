"use client";

import type { Lead } from "@operion/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface OverrideModalProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OverrideModal({ lead, open, onOpenChange }: OverrideModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual Override</DialogTitle>
          <DialogDescription>
            {lead ? `Record a founder-supervised action for ${lead.business_name}.` : "Select a lead first."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="override-action">Action</Label>
            <Select id="override-action" defaultValue="pause_outreach">
              <option value="override_score">Override AI score</option>
              <option value="blacklist">Blacklist lead</option>
              <option value="pause_outreach">Pause outreach</option>
              <option value="force_archive">Force archive</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="override-reason">Reason</Label>
            <Textarea id="override-reason" placeholder="Required for score override and blacklist actions." />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => onOpenChange(false)}>Record Override</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
