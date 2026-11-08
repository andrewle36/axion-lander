"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button, Dialog, Field, Input, Select, Switch } from "@/components/ui";
import { dealNo, money } from "@/lib/utils";
import { STAGES, STAGE_META, COMPANY_KINDS, useTeam, type Stage } from "./shared";

export function NewDealDialog({ open, onClose, stage = "lead", companyId, onCreated }: {
  open: boolean; onClose: () => void; stage?: Stage; companyId?: string; onCreated?: (deal: any) => void;
}) {
  const router = useRouter();
  const me = trpc.team.me.useQuery();
  const team = useTeam();
  const companies = trpc.companies.options.useQuery(undefined, { enabled: open });
  const [mode, setMode] = React.useState<"existing" | "new">(companyId ? "existing" : "new");
  const [f, setF] = React.useState({
    name: "", company_id: companyId ?? "", stage: stage as Stage, cars: "20", price: "", value: "", override: false,
    owner_id: "", expected_close: "", co_name: "", co_kind: "dealer", co_phone: "", co_email: "", co_contact: "",
  });
  React.useEffect(() => {
    if (open) {
      setMode(companyId ? "existing" : "new");
      setF((s) => ({ ...s, name: "", company_id: companyId ?? "", stage, cars: "20", price: "", value: "", override: false, expected_close: "", co_name: "", co_phone: "", co_email: "", co_contact: "", owner_id: me.data?.id ?? "" }));
    }
  }, [open, companyId, stage, me.data?.id]);
  // default price from selected account
  React.useEffect(() => {
    if (mode !== "existing" || !f.company_id) return;
    const co = (companies.data as any[] | undefined)?.find((c) => c.id === f.company_id);
    if (co?.smog_price != null && !f.price) setF((s) => ({ ...s, price: String(co.smog_price) }));
  }, [f.company_id, companies.data, mode, f.price]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const auto = (Number(f.cars) || 0) * (Number(f.price) || 0);
  const create = trpc.deals.create.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Deal ${dealNo(d.number)} created`);
      onClose();
      if (onCreated) onCreated(d); else router.push(`/deals?open=${d.id}`);
    },
  });
  const valid = mode === "new" ? !!f.co_name.trim() : !!f.company_id;
  const submit = () => {
    if (!valid) { toast.error(mode === "new" ? "Enter the account name" : "Pick an account"); return; }
    create.mutate({
      name: f.name.trim() || undefined, stage: f.stage,
      company_id: mode === "existing" ? f.company_id : undefined,
      newCompany: mode === "new" ? { name: f.co_name.trim(), kind: f.co_kind as any, phone: f.co_phone || undefined, email: f.co_email || undefined, contact_name: f.co_contact || undefined } : undefined,
      est_cars_per_month: Math.max(0, Math.round(Number(f.cars) || 0)),
      smog_price: f.price ? Number(f.price) : null,
      value_monthly: f.override && f.value ? Number(f.value) : undefined,
      owner_id: f.owner_id || undefined, expected_close: f.expected_close || null,
      lost_reason: f.stage === "lost" ? window.prompt("Lost reason (required)") ?? undefined : undefined,
    });
  };
  const isAdmin = me.data?.role !== "rep";
  return (
    <Dialog open={open} onClose={onClose} title="New partner deal" width={560}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={submit}>Create deal</Button></>}>
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-center gap-1 rounded bg-subtle p-0.5 text-xs">
            {(["new", "existing"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded px-2 py-1 font-medium ${mode === m ? "bg-bg text-fg shadow-card" : "text-muted"}`}>
                {m === "new" ? "New account" : "Existing account"}
              </button>
            ))}
          </div>
          {mode === "existing" ? (
            <Field label="Partner account">
              <Select value={f.company_id} onChange={set("company_id")}>
                <option value="">Select account…</option>
                {((companies.data as any[]) ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Account name" className="col-span-2"><Input autoFocus value={f.co_name} onChange={set("co_name")} placeholder="Costa Mesa Toyota" /></Field>
              <Field label="Type"><Select value={f.co_kind} onChange={set("co_kind")}>{COMPANY_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</Select></Field>
              <Field label="Contact name"><Input value={f.co_contact} onChange={set("co_contact")} placeholder="Used car manager" /></Field>
              <Field label="Phone"><Input value={f.co_phone} onChange={set("co_phone")} placeholder="(714) 555-0100" /></Field>
              <Field label="Email"><Input type="email" value={f.co_email} onChange={set("co_email")} placeholder="manager@dealer.com" /></Field>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Deal name" className="col-span-2" hint="Defaults to “<Account> partner account”"><Input value={f.name} onChange={set("name")} /></Field>
          <Field label="Stage"><Select value={f.stage} onChange={set("stage")}>{STAGES.map((s) => <option key={s} value={s}>{STAGE_META[s].label}</option>)}</Select></Field>
          <Field label="Expected close"><Input type="date" value={f.expected_close} onChange={set("expected_close")} /></Field>
          <Field label="Est. cars / month"><Input type="number" min={0} value={f.cars} onChange={set("cars")} /></Field>
          <Field label="Partner smog price"><Input type="number" min={0} step="0.25" value={f.price} onChange={set("price")} placeholder="65.00" /></Field>
          <div className="col-span-2 flex items-end gap-3">
            <Field label="Value / month" className="flex-1" hint={f.override ? "Manual override" : `Auto: cars × price = ${money(auto)}`}>
              <Input type="number" min={0} step="0.01" disabled={!f.override} value={f.override ? f.value : String(auto)} onChange={set("value")} />
            </Field>
            <label className="mb-6 flex items-center gap-2 text-xs text-muted"><Switch checked={f.override} onChange={(v) => setF((s) => ({ ...s, override: v, value: v ? String(auto) : "" }))} />Override</label>
          </div>
          {isAdmin && (
            <Field label="Owner" className="col-span-2">
              <Select value={f.owner_id} onChange={set("owner_id")}>
                {(team.data ?? []).filter((p: any) => p.active).map((p: any) => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
              </Select>
            </Field>
          )}
        </div>
      </div>
    </Dialog>
  );
}
