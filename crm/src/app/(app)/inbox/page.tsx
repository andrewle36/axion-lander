"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Inbox as InboxIcon, Search, MessageSquare, Mail, PenSquare } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Avatar, Button, Dialog, Empty, Field, Input, Loading, PageHeader, Select } from "@/components/ui";
import { Conversation } from "@/components/comms/conversation";
import { cn, fullName, shortDate } from "@/lib/utils";

const FILTERS = [["all", "All"], ["unread", "Unread"], ["mine", "Mine"], ["sms", "SMS"], ["email", "Email"]] as const;

function InboxInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<string | null>(params.get("contact"));
  const [compose, setCompose] = useState(false);
  const list = trpc.comms.inbox.useQuery({ filter, q: q || undefined }, { refetchInterval: 15_000 });
  useEffect(() => { const c = params.get("contact"); if (c) setActive(c); }, [params]);
  useEffect(() => { if (!active && list.data?.[0]) setActive(list.data[0].contact.id); }, [list.data, active]);
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<InboxIcon className="h-4 w-4" />} title="Inbox" actions={<Button variant="primary" icon={<PenSquare className="h-3.5 w-3.5" />} onClick={() => setCompose(true)}>New message</Button>} />
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[320px] shrink-0 flex-col border-r border-border">
          <div className="space-y-2 border-b border-border p-2">
            <div className="relative"><Search className="absolute left-2 top-2 h-4 w-4 text-faint" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" className="pl-7" /></div>
            <div className="flex gap-1">{FILTERS.map(([id, l]) => <button key={id} onClick={() => setFilter(id)} className={cn("h-6 rounded px-2 text-xs", filter === id ? "bg-hover font-medium" : "text-muted hover:bg-hover")}>{l}</button>)}</div>
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto">
            {list.isLoading ? <Loading /> : !list.data?.length ? <Empty icon={<InboxIcon className="h-6 w-6" />} title="No conversations" body="Inbound texts and emails appear here." /> :
              list.data.map((t: any) => (
                <button key={t.contact.id} onClick={() => { setActive(t.contact.id); router.replace(`/inbox?contact=${t.contact.id}`); }}
                  className={cn("flex w-full gap-2.5 border-b border-border px-3 py-2.5 text-left hover:bg-subtle", active === t.contact.id && "bg-hover")}>
                  <Avatar name={fullName(t.contact)} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1"><span className={cn("truncate text-sm", t.unread ? "font-semibold" : "font-medium")}>{fullName(t.contact)}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-faint">{shortDate(t.last.created_at)}</span></div>
                    <div className="flex items-center gap-1 text-xs text-muted">
                      {t.last.channel === "sms" ? <MessageSquare className="h-3 w-3 shrink-0" /> : <Mail className="h-3 w-3 shrink-0" />}
                      <span className="truncate">{t.last.direction === "out" ? "You: " : ""}{t.last.channel === "email" ? t.last.subject : t.last.body}</span>
                      {t.unread > 0 && <span className="ml-auto shrink-0 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">{t.unread}</span>}
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </div>
        <div className="min-w-0 flex-1">{active ? <Conversation key={active} contactId={active} /> : <Empty title="Select a conversation" />}</div>
      </div>
      <ComposeDialog open={compose} onClose={() => setCompose(false)} onPick={(id) => { setActive(id); setCompose(false); router.replace(`/inbox?contact=${id}`); }} />
    </div>
  );
}
function ComposeDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const res = trpc.contacts.list.useQuery({ q, pageSize: 20, page: 0, sort: "created_at", dir: "desc" }, { enabled: open && q.length > 1 });
  return (
    <Dialog open={open} onClose={onClose} title="New message">
      <Field label="To (search contacts)"><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or email" /></Field>
      <div className="mt-2 max-h-72 overflow-y-auto">{res.data?.rows.map((c: any) => (
        <button key={c.id} onClick={() => onPick(c.id)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-hover"><Avatar name={fullName(c)} size={20} />{fullName(c)}<span className="ml-auto text-xs text-faint">{c.phone ?? c.email}</span></button>
      ))}</div>
    </Dialog>
  );
}
export default function InboxPage() { return <Suspense><InboxInner /></Suspense>; }
