"use client";

import { Download, ExternalLink, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function DocumentViewer({ documentId, fileName, mimeType }: { documentId: string; fileName: string; mimeType: string | null }) {
  const isPdf = mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  const secureUrl = `/api/documents/${documentId}/signed-url`;
  const viewerUrl = `${secureUrl}?preview=1`;

  if (!isPdf) return <Button asChild variant="outline" size="sm"><a href={secureUrl}>Download document <Download className="h-4 w-4" /></a></Button>;

  return <Dialog>
    <DialogTrigger asChild><Button type="button" variant="outline" size="sm">View in Operion <Maximize2 className="h-4 w-4" /></Button></DialogTrigger>
    <DialogContent aria-describedby={undefined} className="flex h-[min(92dvh,900px)] max-w-6xl flex-col gap-0 overflow-hidden bg-card p-0">
      <div className="min-w-0 border-b border-border p-4 pr-12">
        <DialogTitle className="break-all">{fileName}</DialogTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><a href={viewerUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />Open PDF</a></Button>
          <Button asChild variant="outline" size="sm"><a href={secureUrl}><Download className="h-4 w-4" />Download</a></Button>
        </div>
      </div>
      <iframe title={fileName} src={viewerUrl} referrerPolicy="no-referrer" className="min-h-0 w-full flex-1 bg-muted" />
    </DialogContent>
  </Dialog>;
}
