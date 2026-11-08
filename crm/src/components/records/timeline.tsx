"use client";
import { useState } from "react";
import { MessageSquare, Mail, Phone, StickyNote, ArrowRightLeft, Wrench, DollarSign, FileSignature, Calendar, Sparkles, Info, CheckSquare, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Avatar, Button, Textarea, Loading, Empty, IconButton } from "@/components/ui";
import { relTime, cn } from "@/lib/utils";
import { format } from "date-fns";

const ICON: Record<string, any> = { sms: MessageSquare, email: Mail, call: Phone, note: StickyNote, stage_change: ArrowRightLeft, job: Wrench, payment: DollarSign, contract: FileSignature, meeting: Calendar, ai: Sparkles, system: Info, task: CheckSquare };
const FILTERS = [["", "All"], ["note", "Notes"], ["call", "Calls"], ["sms", "SMS"], ["email", "Email"], ["meeting", "Meetings"], ["job", "Jobs"], ["payment", "Payments"]] as const;

export function Timeline({ contactId, companyId }: { contactId?: string; companyId?: string }) {
  const [type, setType] = useState("");
  const [note, setNote] = useState("");
  const tl = trpc.contacts.timeline.useQuery({ contact_id: contactId, company_id: companyId, type: type || undefined });
  const add = trpc.contacts.addNote.useMutation({ onSuccess: () => setNote("") });
  const del = trpc.contacts.deleteActivity.useMutation();
  return (
    <div className="p-4">
      <div className="mb-4 rounded-md border border-border p-2">
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write a note…" className="border-0 focus:ring-0" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && note.trim()) add.mutate({ contact_id: contactId, company_id: companyId, body: note }); }} />
        <div className="flex justify-end"><Button size="xs" variant="primary" disabled={!note.trim()} loading={add.isPending} onClick={() => add.mutate({ contact_id: contactId, company_id: companyId, body: note })}>Add note</Button></div>
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {FILTERS.map(([id, label]) => <button key={id} onClick={() => setType(id)} className={cn("h-6 rounded px-2 text-xs", type === id ? "bg-hover font-medium" : "text-muted hover:bg-hover")}>{label}</button>)}
      </div>
      {tl.isLoading ? <Loading /> : !tl.data?.length ? <Empty title="No activity yet" /> : (
        <ol className="relative space-y-4 border-l border-border pl-5">
          {tl.data.map((a: any) => {
            const I = ICON[a.type] ?? Info;
            return (
              <li key={a.id} className="group relative">
                <span className="absolute -left-[29px] top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border bg-bg"><I className="h-2.5 w-2.5 text-muted" /></span>
                <div className="flex items-center gap-2 text-xs text-muted">
                  {a.user && <><Avatar name={a.user.full_name} size={14} color={a.user.color} /><span className="font-medium text-fg">{a.user.full_name}</span></>}
                  <span>{a.subject ?? a.type.replace("_", " ")}{a.direction === "in" ? " (inbound)" : ""}</span>
                  <span title={format(new Date(a.created_at), "PPpp")}>· {relTime(a.created_at)}</span>
                  {a.type === "note" && <IconButton label="Delete note" className="ml-auto h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => del.mutate({ id: a.id })}><Trash2 className="h-3 w-3" /></IconButton>}
                </div>
                {a.body && <div className={cn("mt-1 whitespace-pre-wrap text-sm", a.type === "note" && "rounded bg-subtle p-2")}>{a.body}</div>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
