"use client";
import { useEffect } from "react";
import { Printer } from "lucide-react";

export function PayActions({ autoPrint }: { autoPrint?: boolean }) {
  useEffect(() => { if (autoPrint) { const t = setTimeout(() => window.print(), 400); return () => clearTimeout(t); } }, [autoPrint]);
  return (
    <div className="mt-6 flex justify-center print:hidden">
      <button type="button" onClick={() => window.print()} className="inline-flex h-8 items-center gap-1.5 rounded border border-border px-3 text-sm text-muted hover:bg-hover hover:text-fg">
        <Printer className="h-3.5 w-3.5" />Download / print PDF
      </button>
    </div>
  );
}
