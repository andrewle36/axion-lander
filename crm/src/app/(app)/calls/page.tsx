"use client";
import { useRouter } from "next/navigation";
import { Phone, PhoneIncoming, PhoneOutgoing } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button, Empty, Loading, PageHeader, StatusBadge, Table, Td, Th, Stat } from "@/components/ui";
import { useDialer } from "@/components/dialer/dialer";
import { fmtPhone, fullName, shortDate } from "@/lib/utils";

export default function CallsPage() {
  const router = useRouter();
  const { call, open } = useDialer();
  const calls = trpc.comms.calls.useQuery({ limit: 300 });
  const rows = calls.data ?? [];
  const today = rows.filter((c: any) => new Date(c.started_at).toDateString() === new Date().toDateString());
  const talk = rows.reduce((s: number, c: any) => s + c.duration_sec, 0);
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<Phone className="h-4 w-4" />} title="Calls" count={rows.length} actions={<Button variant="primary" icon={<Phone className="h-3.5 w-3.5" />} onClick={open}>Open dialer</Button>} />
      <div className="grid grid-cols-2 gap-3 border-b border-border p-4 md:grid-cols-4">
        <Stat label="Calls today" value={today.length} />
        <Stat label="Outbound / inbound" value={`${rows.filter((c: any) => c.direction === "out").length} / ${rows.filter((c: any) => c.direction === "in").length}`} />
        <Stat label="Connected" value={rows.filter((c: any) => c.status === "completed").length} />
        <Stat label="Talk time" value={`${Math.round(talk / 60)} min`} />
      </div>
      <div className="min-h-0 flex-1">
        {calls.isLoading ? <Loading /> : !rows.length ? <Empty icon={<Phone className="h-8 w-8" />} title="No calls yet" body="Calls from the browser softphone (Telnyx) are logged here automatically." /> : (
          <Table className="h-full">
            <thead><tr><Th>Direction</Th><Th>Contact</Th><Th>Number</Th><Th>Status</Th><Th>Duration</Th><Th>By</Th><Th>When</Th><Th>Summary</Th><Th /></tr></thead>
            <tbody>{rows.map((c: any) => {
              const num = c.direction === "out" ? c.to_number : c.from_number;
              return (
                <tr key={c.id} className="hover:bg-subtle">
                  <Td>{c.direction === "in" ? <span className="flex items-center gap-1 text-success"><PhoneIncoming className="h-3.5 w-3.5" />In</span> : <span className="flex items-center gap-1 text-accent"><PhoneOutgoing className="h-3.5 w-3.5" />Out</span>}</Td>
                  <Td>{c.contact ? <button className="text-accent hover:underline" onClick={() => router.push(`/contacts/${c.contact.id}`)}>{fullName(c.contact)}</button> : <span className="text-faint">Unknown</span>}</Td>
                  <Td className="text-muted">{fmtPhone(num)}</Td><Td><StatusBadge status={c.status} /></Td>
                  <Td>{Math.floor(c.duration_sec / 60)}:{String(c.duration_sec % 60).padStart(2, "0")}</Td><Td className="text-muted">{c.user?.full_name}</Td><Td className="text-muted">{shortDate(c.started_at)}</Td>
                  <Td className="max-w-[320px] truncate text-muted">{c.ai_summary ?? c.notes}</Td>
                  <Td>{num && <Button size="xs" icon={<Phone className="h-3 w-3" />} onClick={() => call({ number: num, contactId: c.contact?.id, name: c.contact ? fullName(c.contact) : null })}>Call back</Button>}</Td>
                </tr>
              );
            })}</tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
