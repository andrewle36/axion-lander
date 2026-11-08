"use client";
import * as React from "react";
import { format } from "date-fns";
import { Search, UserPlus, X, Car, Plus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button, Dialog, Field, Input, Select, Switch, Textarea, Badge } from "@/components/ui";
import { cn, fullName, fmtPhone, money } from "@/lib/utils";
import { PAYMENT_METHODS, SERVICE_CATEGORY_LABEL } from "./period";

type VCat = "passenger" | "van" | "exotic" | "sprinter" | "old" | "old_luxury";
const VCATS: { id: VCat; label: string }[] = [
  { id: "passenger", label: "Passenger" }, { id: "van", label: "Van" }, { id: "exotic", label: "Exotic" },
  { id: "sprinter", label: "Sprinter" }, { id: "old", label: "Old (pre-2000)" }, { id: "old_luxury", label: "Old luxury" },
];
type Method = (typeof PAYMENT_METHODS)[number];
type Result = "pass" | "fail" | "na";

export type EditableJob = {
  id: string; number?: number; service_id: string | null; price: number | string; cert_fee: number | string; result: Result; payment_method: Method; paid: boolean;
  technician_id: string | null; performed_at: string; description: string | null; company_id: string | null; contact_id: string | null; vehicle_id: string | null;
  contact?: { first_name?: string | null; last_name?: string | null; phone?: string | null } | null;
  vehicle?: { year?: number | null; make?: string | null; model?: string | null; vin?: string | null; plate?: string | null; category?: string | null } | null;
};

export function LogJobDialog({ open, onClose, contactId, companyId, vehicleId, job, onSaved }: {
  open: boolean; onClose: () => void; contactId?: string | null; companyId?: string | null; vehicleId?: string | null;
  /** Pass a job to edit it instead of logging a new one. */
  job?: EditableJob | null; onSaved?: (job: { id: string; number?: number }) => void;
}) {
  if (!open) return null;
  return <LogJobForm onClose={onClose} contactId={contactId} companyId={companyId} vehicleId={vehicleId} job={job} onSaved={onSaved} />;
}

function LogJobForm({ onClose, contactId, companyId, vehicleId, job, onSaved }: {
  onClose: () => void; contactId?: string | null; companyId?: string | null; vehicleId?: string | null; job?: EditableJob | null; onSaved?: (job: { id: string; number?: number }) => void;
}) {
  const editing = !!job;
  const services = trpc.settings.services.useQuery();
  const companies = trpc.companies.options.useQuery();
  const techs = trpc.jobs.technicians.useQuery();
  const me = trpc.team.me.useQuery();
  const presetContact = trpc.contacts.get.useQuery({ id: contactId! }, { enabled: !!contactId && !editing });

  const [customer, setCustomer] = React.useState<"retail" | "partner">(job ? (job.company_id ? "partner" : "retail") : companyId ? "partner" : "retail");
  const [coId, setCoId] = React.useState<string>(job?.company_id ?? companyId ?? "");
  const [serviceId, setServiceId] = React.useState<string>(job?.service_id ?? "");
  const [result, setResult] = React.useState<Result>(job?.result ?? "pass");
  const [price, setPrice] = React.useState<string>(job ? String(Number(job.price)) : "");
  const [cert, setCert] = React.useState<string>(job ? String(Number(job.cert_fee)) : "");
  const [priceTouched, setPriceTouched] = React.useState(editing);
  const [method, setMethod] = React.useState<Method>(job?.payment_method ?? "card");
  const [methodTouched, setMethodTouched] = React.useState(editing);
  const [paid, setPaid] = React.useState<boolean>(job?.paid ?? true);
  const [tech, setTech] = React.useState<string>(job?.technician_id ?? "");
  const [when, setWhen] = React.useState<string>(format(job ? new Date(job.performed_at) : new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [notes, setNotes] = React.useState<string>(job?.description ?? "");

  // customer
  const [contact, setContact] = React.useState<{ id: string; name: string; phone?: string | null } | null>(
    job?.contact_id ? { id: job.contact_id, name: fullName(job.contact ?? {}), phone: job.contact?.phone } : null);
  const [newContact, setNewContact] = React.useState<{ first_name: string; last_name: string; phone: string } | null>(null);
  const [q, setQ] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const search = trpc.jobs.contactSearch.useQuery({ q, company_id: customer === "partner" && coId ? coId : null }, { enabled: !editing && searchOpen });

  // vehicle
  const [vehId, setVehId] = React.useState<string>(job?.vehicle_id ?? vehicleId ?? "");
  const [newVeh, setNewVeh] = React.useState<{ year: string; make: string; model: string; vin: string; plate: string; category: VCat } | null>(null);
  const vehicles = trpc.jobs.vehicles.useQuery({ contact_id: contact?.id ?? null, company_id: customer === "partner" && coId ? coId : null }, { enabled: !editing && (!!contact?.id || (customer === "partner" && !!coId)) });

  React.useEffect(() => {
    const c = presetContact.data as any;
    if (!c || contact) return;
    setContact({ id: c.id, name: fullName(c), phone: c.phone });
    if (c.company_id && !companyId) { setCustomer("partner"); setCoId(c.company_id); }
  }, [presetContact.data]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (!tech && me.data && !editing) setTech(me.data.id); }, [me.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeServices = React.useMemo(() => ((services.data ?? []) as any[]).filter((s) => s.active || s.id === serviceId), [services.data, serviceId]);
  const svc = activeServices.find((s) => s.id === serviceId) as any;
  const co = ((companies.data ?? []) as any[]).find((c) => c.id === coId);
  const selectedVeh = ((vehicles.data ?? []) as any[]).find((v) => v.id === vehId);
  const vcat: VCat = (newVeh?.category ?? selectedVeh?.category ?? job?.vehicle?.category ?? "passenger") as VCat;

  // default service = first smog for this vehicle category
  React.useEffect(() => {
    if (serviceId || !activeServices.length || editing) return;
    const s = activeServices.find((x) => x.category === "smog" && x.vehicle_category === vcat) ?? activeServices.find((x) => x.category === "smog") ?? activeServices[0];
    if (s) setServiceId(s.id);
  }, [activeServices]); // eslint-disable-line react-hooks/exhaustive-deps

  // price auto-fill: partner price from the account, retail from the catalog. Fail → no certificate.
  const autoPrice = React.useMemo(() => {
    if (!svc) return null;
    let p = Number(svc.price);
    const certFee = Number(svc.cert_fee) || 0;
    if (customer === "partner" && co) {
      // Partner smog prices are ALL-IN (include the certificate): price = all-in minus cert, cert_fee = cert on pass.
      const old = vcat === "old" || vcat === "old_luxury";
      if (svc.category === "vin" && co.vin_price != null) p = Number(co.vin_price);
      else if (svc.category === "smog") {
        const allIn = old ? co.old_car_price : co.smog_price;
        if (allIn != null) p = Math.max(0, Math.round((Number(allIn) - (certFee || 8.25)) * 100) / 100);
      }
    }
    return { price: p, cert: result === "fail" ? 0 : certFee };
  }, [svc, customer, co, vcat, result]);
  React.useEffect(() => {
    if (!autoPrice) return;
    if (!priceTouched) setPrice(String(autoPrice.price));
    setCert(String(autoPrice.cert));
  }, [autoPrice?.price, autoPrice?.cert]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (svc && !editing) setResult(["smog", "retest"].includes(svc.category) ? (result === "na" ? "pass" : result) : "na"); }, [svc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (result === "fail") setCert("0"); }, [result]);

  // payment default: monthly-billed partners go on the invoice, unpaid
  React.useEffect(() => {
    if (methodTouched) return;
    if (customer === "partner" && co?.billing_method === "monthly_invoice") { setMethod("invoice"); setPaid(false); }
    else { setMethod(co?.billing_method === "check" ? "check" : co?.billing_method === "zelle" ? "zelle" : co?.billing_method === "cash" ? "cash" : "card"); setPaid(true); }
  }, [customer, co?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = trpc.jobs.create.useMutation();
  const update = trpc.jobs.update.useMutation();
  const total = (Number(price) || 0) + (Number(cert) || 0);

  async function save(another = false) {
    if (customer === "partner" && !coId) return toast.error("Pick the partner account.");
    if (!serviceId && !notes.trim()) return toast.error("Pick a service.");
    const base = {
      service_id: serviceId || null, price: Number(price) || 0, cert_fee: result === "fail" ? 0 : Number(cert) || 0, result, payment_method: method,
      paid: method === "invoice" ? false : paid, technician_id: tech || null, performed_at: new Date(when).toISOString(),
      description: notes.trim() || null, company_id: customer === "partner" ? coId : null,
    };
    if (editing) {
      const r = await update.mutateAsync({ id: job!.id, ...base });
      toast.success(`Job J-${r.number} updated`); onSaved?.(r); onClose(); return;
    }
    const r = await create.mutateAsync({
      ...base, contact_id: contact?.id ?? null, vehicle_id: vehId || null, local_date: when.slice(0, 10),
      new_contact: !contact && newContact?.first_name.trim() ? { first_name: newContact.first_name, last_name: newContact.last_name, phone: newContact.phone } : undefined,
      new_vehicle: !vehId && newVeh ? { year: newVeh.year ? Number(newVeh.year) : null, make: newVeh.make, model: newVeh.model, vin: newVeh.vin, plate: newVeh.plate, category: newVeh.category } : undefined,
    });
    toast.success(`Logged J-${r.number}: ${money(Number(r.price) + Number(r.cert_fee))}`);
    onSaved?.(r);
    if (another) {
      setVehId(""); setNewVeh(null); setNotes(""); setPriceTouched(false); setWhen(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
      if (customer === "retail") { setContact(null); setNewContact(null); setQ(""); }
    } else onClose();
  }

  const grouped = React.useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const s of activeServices) (g[s.category] ??= []).push(s);
    return g;
  }, [activeServices]);
  const busy = create.isPending || update.isPending;

  return (
    <Dialog open onClose={onClose} width={640} title={editing ? `Edit job J-${job?.number ?? ""}` : "Log job"}
      footer={<>
        <div className="mr-auto self-center text-sm text-muted">Total <span className="font-semibold text-fg tabular-nums">{money(total)}</span></div>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        {!editing && <Button loading={busy} onClick={() => save(true)}>Save &amp; log another</Button>}
        <Button variant="primary" loading={busy} onClick={() => save(false)}>{editing ? "Save changes" : "Log job"}</Button>
      </>}>
      <div className="space-y-4">
        {/* customer type */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="inline-flex rounded border border-border p-0.5">
            {(["retail", "partner"] as const).map((t) => (
              <button key={t} type="button" onClick={() => { setCustomer(t); setPriceTouched(false); setMethodTouched(false); }}
                className={cn("h-7 rounded px-3 text-sm", customer === t ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}>
                {t === "retail" ? "Retail" : "Partner account"}
              </button>
            ))}
          </div>
          {customer === "partner" && (
            <Field label="Account" className="min-w-[220px] flex-1">
              <Select value={coId} onChange={(e) => { setCoId(e.target.value); setPriceTouched(false); setMethodTouched(false); setVehId(""); }}>
                <option value="">Select account…</option>
                {((companies.data ?? []) as any[]).map((c) => <option key={c.id} value={c.id}>{c.name}{c.smog_price != null ? ` · $${Number(c.smog_price)} all-in` : ""}</option>)}
              </Select>
            </Field>
          )}
        </div>

        {/* contact */}
        {!editing ? (
          <div>
            <div className="mb-1 text-xs font-medium text-muted">{customer === "partner" ? "Contact (optional)" : "Customer"}</div>
            {contact ? (
              <div className="flex h-8 items-center gap-2 rounded border border-border bg-subtle px-2.5 text-sm">
                <span className="font-medium">{contact.name}</span><span className="text-faint">{fmtPhone(contact.phone)}</span>
                <button type="button" className="ml-auto text-faint hover:text-fg" onClick={() => { setContact(null); setVehId(""); }} aria-label="Clear customer"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : newContact ? (
              <div className="grid grid-cols-3 gap-2">
                <Input autoFocus placeholder="First name *" value={newContact.first_name} onChange={(e) => setNewContact({ ...newContact, first_name: e.target.value })} />
                <Input placeholder="Last name" value={newContact.last_name} onChange={(e) => setNewContact({ ...newContact, last_name: e.target.value })} />
                <div className="flex gap-1">
                  <Input placeholder="Phone" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
                  <Button variant="ghost" size="sm" onClick={() => setNewContact(null)} aria-label="Cancel new customer"><X className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-faint" />
                <Input className="pl-8" placeholder="Search name or phone…" value={q} onFocus={() => setSearchOpen(true)} onBlur={() => setTimeout(() => setSearchOpen(false), 150)} onChange={(e) => { setQ(e.target.value); setSearchOpen(true); }} />
                {searchOpen && (
                  <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-bg p-1 shadow-pop">
                    {((search.data ?? []) as any[]).map((c) => (
                      <button key={c.id} type="button" className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-hover"
                        onMouseDown={(e) => e.preventDefault()} onClick={() => { setContact({ id: c.id, name: fullName(c), phone: c.phone }); setSearchOpen(false); setVehId(""); }}>
                        <span className="font-medium">{fullName(c)}</span><span className="text-faint">{fmtPhone(c.phone)}</span>
                      </button>
                    ))}
                    {search.isFetching && <div className="px-2 py-1.5 text-xs text-faint">Searching…</div>}
                    <button type="button" className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm text-accent hover:bg-hover"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { const digits = q.replace(/\D/g, ""); setNewContact({ first_name: digits.length >= 7 ? "" : q.split(" ")[0] ?? "", last_name: digits.length >= 7 ? "" : q.split(" ").slice(1).join(" "), phone: digits.length >= 7 ? q : "" }); setSearchOpen(false); }}>
                      <UserPlus className="h-4 w-4" />New customer{q ? ` "${q}"` : ""}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted">Customer: <span className="text-fg">{job?.contact ? fullName(job.contact) : "—"}</span>
            {job?.vehicle && <> · Vehicle: <span className="text-fg">{[job.vehicle.year, job.vehicle.make, job.vehicle.model].filter(Boolean).join(" ") || job.vehicle.vin}</span></>}</div>
        )}

        {/* vehicle */}
        {!editing && (
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted"><Car className="h-3.5 w-3.5" />Vehicle</div>
            {newVeh ? (
              <div className="grid grid-cols-6 gap-2">
                <Input className="col-span-1" placeholder="Year" inputMode="numeric" value={newVeh.year} onChange={(e) => {
                  const year = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setNewVeh({ ...newVeh, year, category: year.length === 4 && Number(year) < 2000 && newVeh.category === "passenger" ? "old" : newVeh.category });
                }} />
                <Input className="col-span-2" placeholder="Make" value={newVeh.make} onChange={(e) => setNewVeh({ ...newVeh, make: e.target.value })} />
                <Input className="col-span-3" placeholder="Model" value={newVeh.model} onChange={(e) => setNewVeh({ ...newVeh, model: e.target.value })} />
                <Input className="col-span-3 uppercase" placeholder="VIN" value={newVeh.vin} onChange={(e) => setNewVeh({ ...newVeh, vin: e.target.value })} />
                <Input className="col-span-1 uppercase" placeholder="Plate" value={newVeh.plate} onChange={(e) => setNewVeh({ ...newVeh, plate: e.target.value })} />
                <div className="col-span-2 flex gap-1">
                  <Select className="flex-1" value={newVeh.category} onChange={(e) => { setNewVeh({ ...newVeh, category: e.target.value as VCat }); setPriceTouched(false); }}>
                    {VCATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => setNewVeh(null)} aria-label="Cancel new vehicle"><X className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Select className="flex-1" value={vehId} onChange={(e) => { setVehId(e.target.value); setPriceTouched(false); }}>
                  <option value="">{(vehicles.data ?? []).length ? "Select vehicle…" : "No saved vehicles"}</option>
                  {((vehicles.data ?? []) as any[]).map((v) => <option key={v.id} value={v.id}>{[v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle"}{v.plate ? ` · ${v.plate}` : ""}{v.vin ? ` · …${String(v.vin).slice(-6)}` : ""} ({v.category})</option>)}
                </Select>
                <Button icon={<Plus className="h-3.5 w-3.5" />} onClick={() => { setVehId(""); setNewVeh({ year: "", make: "", model: "", vin: "", plate: "", category: "passenger" }); }}>New vehicle</Button>
              </div>
            )}
          </div>
        )}

        {/* service + result */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Service">
            <Select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setPriceTouched(false); }}>
              <option value="">Select service…</option>
              {Object.entries(grouped).map(([cat, list]) => (
                <optgroup key={cat} label={SERVICE_CATEGORY_LABEL[cat] ?? cat}>
                  {list.map((s) => <option key={s.id} value={s.id}>{s.name} · {money(Number(s.price) + Number(s.cert_fee))}</option>)}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label="Result">
            <div className="inline-flex h-8 w-full rounded border border-border p-0.5">
              {(["pass", "fail", "na"] as const).map((r) => (
                <button key={r} type="button" onClick={() => setResult(r)}
                  className={cn("flex-1 rounded text-sm capitalize", result === r ? (r === "pass" ? "bg-success text-white" : r === "fail" ? "bg-danger text-white" : "bg-subtle text-fg") : "text-muted hover:text-fg")}>
                  {r === "na" ? "N/A" : r}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Price" hint={autoPrice && Number(price) !== autoPrice.price ? `Price sheet: ${money(autoPrice.price)}` : customer === "partner" && co && svc?.category === "smog" ? "Partner all-in price minus certificate" : customer === "partner" && co ? "Partner price" : "Catalog price"}>
            <Input type="number" step="0.01" min="0" value={price} onChange={(e) => { setPrice(e.target.value); setPriceTouched(true); }} />
          </Field>
          <Field label="Certificate fee" hint={result === "fail" ? "No certificate on a fail" : "Pass-through to BAR"}>
            <Input type="number" step="0.01" min="0" value={cert} disabled={result === "fail"} onChange={(e) => setCert(e.target.value)} />
          </Field>
          <Field label="Technician">
            <Select value={tech} onChange={(e) => setTech(e.target.value)}>
              <option value="">Unassigned</option>
              {((techs.data ?? []) as any[]).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </Select>
          </Field>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-muted">Payment</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button key={m} type="button" onClick={() => { setMethod(m); setMethodTouched(true); setPaid(m !== "invoice"); }}
                className={cn("h-7 rounded border px-3 text-sm capitalize", method === m ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:text-fg")}>
                {m}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-sm text-muted">
              <Switch checked={method === "invoice" ? false : paid} disabled={method === "invoice"} onChange={setPaid} />Paid
            </label>
          </div>
          {method === "invoice" && <div className="mt-1 text-xs text-faint">Goes on the account's month-end invoice{customer === "retail" ? " (create a manual invoice for this customer from Invoices)" : ""}.</div>}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Performed at"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
          <Field label="Notes / description" className="col-span-2"><Textarea rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={svc?.name ?? "e.g. Registration renewal"} /></Field>
        </div>
        {svc && <div className="flex flex-wrap gap-1.5 text-xs"><Badge>{SERVICE_CATEGORY_LABEL[svc.category] ?? svc.category}</Badge>{svc.vehicle_category && <Badge>{svc.vehicle_category}</Badge>}{Number(svc.cost) > 0 && <Badge>cost {money(svc.cost)}</Badge>}</div>}
      </div>
    </Dialog>
  );
}
