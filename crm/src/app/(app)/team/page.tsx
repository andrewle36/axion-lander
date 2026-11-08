"use client";
import { useState } from "react";
import { toast } from "sonner";
import { UserCog, Plus, Mail } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Avatar, Badge, Button, Card, Dialog, Field, Input, Loading, PageHeader, Select, Switch, Table, Td, Th, confirmAction } from "@/components/ui";
import { shortDate } from "@/lib/utils";

const COLORS = ["#4f46e5", "#0891b2", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0d9488", "#dc2626"];

export default function TeamPage() {
  const me = trpc.team.me.useQuery();
  const team = trpc.team.list.useQuery();
  const invites = trpc.team.invites.useQuery();
  const update = trpc.team.update.useMutation({ onSuccess: () => toast.success("Saved") });
  const cancel = trpc.team.cancelInvite.useMutation();
  const [open, setOpen] = useState(false);
  const isOwner = me.data?.role === "owner";
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<UserCog className="h-4 w-4" />} title="Team" count={team.data?.length} actions={<Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>Invite teammate</Button>} />
      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">
        <Card title="Members">
          {team.isLoading ? <Loading /> : (
            <Table><thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Active</Th><Th>Commission %</Th><Th>Months</Th><Th>Round robin</Th><Th>Color</Th><Th>Joined</Th></tr></thead>
              <tbody>{team.data?.map((p) => (
                <tr key={p.id}>
                  <Td><span className="flex items-center gap-2"><Avatar name={p.full_name} size={20} color={p.color} />
                    <input defaultValue={p.full_name ?? ""} onBlur={(e) => e.target.value !== p.full_name && update.mutate({ id: p.id, full_name: e.target.value })} className="w-36 rounded px-1 hover:bg-hover focus:bg-bg focus:outline-accent" /></span></Td>
                  <Td className="text-muted">{p.email}</Td>
                  <Td><Select value={p.role} disabled={p.id === me.data?.id || (!isOwner && p.role === "owner")} onChange={(e) => update.mutate({ id: p.id, role: e.target.value as any })} className="w-24">
                    {(isOwner ? ["owner", "admin", "rep"] : ["admin", "rep"]).map((r) => <option key={r}>{r}</option>)}{!isOwner && p.role === "owner" && <option>owner</option>}</Select></Td>
                  <Td><Switch checked={p.active} disabled={p.id === me.data?.id} onChange={(v) => update.mutate({ id: p.id, active: v })} /></Td>
                  <Td><Input type="number" step="0.5" min={0} max={100} defaultValue={(Number(p.commission_rate) * 100).toFixed(1)} className="w-20"
                    onBlur={(e) => { const v = Number(e.target.value) / 100; if (v !== Number(p.commission_rate)) update.mutate({ id: p.id, commission_rate: v }); }} /></Td>
                  <Td><Input type="number" min={0} defaultValue={p.commission_months} className="w-16" onBlur={(e) => Number(e.target.value) !== p.commission_months && update.mutate({ id: p.id, commission_months: Number(e.target.value) })} /></Td>
                  <Td><span className="flex items-center gap-2"><Switch checked={!p.rr_paused} onChange={(v) => update.mutate({ id: p.id, rr_paused: !v })} /><span className="text-xs text-muted">{p.rr_paused ? "Paused" : "Receiving leads"}</span></span></Td>
                  <Td><div className="flex gap-1">{COLORS.map((c) => <button key={c} onClick={() => update.mutate({ id: p.id, color: c })} className={`h-4 w-4 rounded-full ${p.color === c ? "ring-2 ring-offset-1 ring-fg" : ""}`} style={{ background: c }} />)}</div></Td>
                  <Td className="text-muted">{shortDate(p.created_at)}</Td>
                </tr>))}</tbody></Table>
          )}
        </Card>
        {!!invites.data?.length && (
          <Card title="Pending invites">
            <Table><thead><tr><Th>Email</Th><Th>Name</Th><Th>Role</Th><Th>Commission</Th><Th>Sent</Th><Th /></tr></thead>
              <tbody>{invites.data.map((i: any) => (
                <tr key={i.email}><Td><span className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted" />{i.email}</span></Td><Td>{i.full_name}</Td><Td><Badge>{i.role}</Badge></Td>
                  <Td>{(Number(i.commission_rate) * 100).toFixed(1)}%</Td><Td className="text-muted">{shortDate(i.created_at)}</Td>
                  <Td><Button size="xs" variant="ghost" onClick={() => confirmAction("Cancel invite?") && cancel.mutate({ email: i.email })}>Cancel</Button></Td></tr>))}</tbody></Table>
          </Card>
        )}
        <p className="text-xs text-faint">Reps see their own contacts, deals, calls and commissions. Admins and the owner see everything including Finance. Pause round robin to stop a rep receiving new landing-page leads.</p>
      </div>
      <InviteDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ email: "", full_name: "", role: "rep", rate: "10" });
  const invite = trpc.team.invite.useMutation({ onSuccess: () => { toast.success("Invite sent"); onClose(); setF({ email: "", full_name: "", role: "rep", rate: "10" }); } });
  return (
    <Dialog open={open} onClose={onClose} title="Invite teammate"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={invite.isPending} disabled={!f.email} onClick={() => invite.mutate({ email: f.email, full_name: f.full_name || undefined, role: f.role as any, commission_rate: Number(f.rate) / 100 })}>Send invite</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email" className="col-span-2"><Input type="email" autoFocus value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Full name" className="col-span-2"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="rep">Sales rep</option><option value="admin">Admin</option></Select></Field>
        <Field label="Commission % of collected revenue"><Input type="number" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}
