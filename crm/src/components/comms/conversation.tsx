"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Send, Sparkles, MessageSquare, Mail, Phone, Check, CheckCheck, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button, Input, Textarea, Loading, Empty, Menu, MenuItem } from "@/components/ui";
import { cn, fmtPhone, fullName } from "@/lib/utils";
import { format, isSameDay } from "date-fns";
import { useDialer } from "@/components/dialer/dialer";

const QUICK = [
  { label: "Booking link", body: "Hi {{first_name}}, this is {{rep_name}} at Newport Smog. You can book your smog check here: {{booking_link}} or just stop by, we're open Mon-Fri 8-6, Sat 8-4." },
  { label: "Directions", body: "We're at 375 Bristol St Unit 80, Costa Mesa (look for the Newport Smog Test Only sign). Call (714) 436-1700 if you need anything!" },
  { label: "STAR station", body: "Yes, we're a STAR certified station, so we can smog vehicles the DMV directs to STAR. Passenger cars are $73 + $8.25 certificate." },
  { label: "Review request", body: "Thanks for coming in, {{first_name}}! If you have a sec, a Google or Yelp review helps us a ton." },
];

export function Conversation({ contactId, compact }: { contactId: string; compact?: boolean }) {
  const contact = trpc.contacts.get.useQuery({ id: contactId });
  const thread = trpc.comms.thread.useQuery({ contact_id: contactId }, { refetchInterval: 10_000 });
  const markRead = trpc.comms.markRead.useMutation({ meta: { keepCache: true, silent: true } });
  const sendSms = trpc.comms.sendSms.useMutation({ onSuccess: () => { setBody(""); toast.success("Text sent"); } });
  const sendEmail = trpc.comms.sendEmail.useMutation({ onSuccess: () => { setBody(""); setSubject(""); toast.success("Email sent"); } });
  const draft = trpc.comms.draft.useMutation({ meta: { keepCache: true } });
  const { call } = useDialer();
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [goal, setGoal] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const msgs = thread.data ?? [];

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);
  useEffect(() => {
    if (msgs.some((m: any) => m.direction === "in" && !m.read_at)) markRead.mutate({ contact_id: contactId });
  }, [msgs, contactId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (contact.data && !contact.data.phone && contact.data.email) setChannel("email"); }, [contact.data]);

  const c = contact.data;
  const send = () => {
    if (!body.trim()) return;
    if (channel === "sms") sendSms.mutate({ contact_id: contactId, body });
    else { if (!subject.trim()) return toast.error("Add a subject"); sendEmail.mutate({ contact_id: contactId, subject, body }); }
  };
  const aiDraft = async () => {
    const r = await draft.mutateAsync({ contact_id: contactId, channel, goal });
    setBody(r.body); if (channel === "email" && r.subject) setSubject(r.subject);
  };
  const segments = Math.max(1, Math.ceil(body.length / 160));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact && c && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{fullName(c)}</div><div className="truncate text-xs text-muted">{fmtPhone(c.phone)} {c.email && `· ${c.email}`}</div></div>
          {c.phone && <Button size="xs" icon={<Phone className="h-3 w-3" />} onClick={() => call({ number: c.phone!, contactId: c.id, companyId: c.company_id, name: fullName(c) })}>Call</Button>}
          <Button size="xs" onClick={() => window.open(`/contacts/${c.id}`, "_self")}>Profile</Button>
        </div>
      )}
      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto bg-panel px-4 py-3">
        {thread.isLoading ? <Loading /> : !msgs.length ? <Empty icon={<MessageSquare className="h-6 w-6" />} title="No messages yet" body="Send a text or email below. Replies show up here and in the Inbox." /> :
          msgs.map((m: any, i: number) => {
            const showDay = i === 0 || !isSameDay(new Date(m.created_at), new Date(msgs[i - 1].created_at));
            const out = m.direction === "out";
            return (
              <div key={m.id}>
                {showDay && <div className="my-2 text-center text-xs text-faint">{format(new Date(m.created_at), "EEEE, MMM d")}</div>}
                <div className={cn("flex", out ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[78%] rounded-lg px-3 py-2 text-sm", out ? "bg-accent text-white" : "border border-border bg-bg")}>
                    {m.channel === "email" && <div className={cn("mb-1 flex items-center gap-1 text-xs font-semibold", out ? "text-white/80" : "text-muted")}><Mail className="h-3 w-3" />{m.subject}</div>}
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    <div className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", out ? "text-white/70" : "text-faint")}>
                      {m.channel === "sms" ? "SMS" : "Email"} · {format(new Date(m.created_at), "h:mm a")}
                      {out && (m.status === "failed" ? <span title={m.error}><AlertCircle className="h-3 w-3 text-red-200" /></span> : m.status === "delivered" || m.status === "opened" ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                      {m.automation_run_id && " · automation"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        <div ref={end} />
      </div>
      <div className="border-t border-border bg-bg p-3">
        <div className="mb-2 flex items-center gap-1">
          <button onClick={() => setChannel("sms")} className={cn("flex h-7 items-center gap-1 rounded px-2 text-xs", channel === "sms" ? "bg-hover font-medium" : "text-muted hover:bg-hover")}><MessageSquare className="h-3.5 w-3.5" />SMS</button>
          <button onClick={() => setChannel("email")} className={cn("flex h-7 items-center gap-1 rounded px-2 text-xs", channel === "email" ? "bg-hover font-medium" : "text-muted hover:bg-hover")}><Mail className="h-3.5 w-3.5" />Email</button>
          <Menu trigger={<button className="h-7 rounded px-2 text-xs text-muted hover:bg-hover">Templates</button>} width={260}>
            {(close) => QUICK.map((q) => <MenuItem key={q.label} onClick={() => { setBody(q.body); close(); }}>{q.label}</MenuItem>)}
          </Menu>
          <div className="ml-auto flex items-center gap-1">
            <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="AI goal (optional)" className="h-7 w-40 text-xs" />
            <Button size="xs" variant="outline" icon={<Sparkles className="h-3 w-3" />} loading={draft.isPending} onClick={aiDraft}>AI draft</Button>
          </div>
        </div>
        {channel === "email" && <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="mb-2" />}
        <Textarea rows={compact ? 2 : 3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={channel === "sms" ? (c?.phone ? `Text ${fmtPhone(c.phone)}… ({{first_name}} works)` : "This contact has no phone number") : (c?.email ? `Email ${c.email}…` : "This contact has no email")}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(); }} />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-faint">{channel === "sms" ? `${body.length} chars · ${segments} segment${segments > 1 ? "s" : ""}${c?.dnd_sms ? " · opted out (STOP)" : ""}` : "⌘↵ to send"}</span>
          <Button variant="primary" size="sm" icon={<Send className="h-3.5 w-3.5" />} loading={sendSms.isPending || sendEmail.isPending} onClick={send}
            disabled={!body.trim() || (channel === "sms" ? !c?.phone || c?.dnd_sms : !c?.email || c?.dnd_email)}>Send {channel === "sms" ? "text" : "email"}</Button>
        </div>
      </div>
    </div>
  );
}
