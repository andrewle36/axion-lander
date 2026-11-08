"use client";
import * as React from "react";
import Link from "next/link";
import { format, isPast } from "date-fns";
import { Home, Plus, CalendarDays, CheckSquare, Activity, Trophy, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { PageHeader, Button, Card, Loading, Checkbox, Avatar, Badge, Empty } from "@/components/ui";
import { money, compactMoney, pct, fullName, relTime, cn } from "@/lib/utils";
import { Kpi, TrendArea, Bars, BarList } from "@/components/money/charts";
import { LogJobDialog } from "@/components/money/log-job";
import { delta, tzOffset } from "@/components/money/period";

const STAGE_LABEL: Record<string, string> = { lead: "Lead", qualified: "Qualified", proposal: "Proposal", contract_sent: "Contract sent", won: "Won", lost: "Lost" };
const FUNNEL_LABEL: Record<string, string> = { lead: "Lead", contacted: "Contacted", booked: "Booked", customer: "Customer", lost: "Lost" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;

export default function DashboardPage() {
  const q = trpc.dashboard.summary.useQuery({ tzOffset: tzOffset() }, { refetchInterval: 60_000 });
  const toggle = trpc.tasks.toggle.useMutation();
  const [log, setLog] = React.useState(false);
  const d = q.data;
  const first = (d?.name ?? "").split(" ")[0];

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<Home className="h-4 w-4" />} title="Dashboard"
        actions={<>
          <Link href="/calendar"><Button icon={<CalendarDays className="h-3.5 w-3.5" />}>Calendar</Button></Link>
          <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setLog(true)}>Log job</Button>
        </>} />
      <div className="flex-1 overflow-auto bg-panel p-4">
        <div className="mb-4">
          <div className="text-xl font-semibold tracking-tight">{greeting()}{first ? `, ${first}` : ""}</div>
          <div className="text-sm text-muted">{format(new Date(), "EEEE, MMMM d, yyyy")}{d && !d.admin && " · your accounts and customers"}</div>
        </div>
        {q.isLoading || !d ? <Loading /> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <Kpi label="Revenue today" value={money(d.kpis.revenue_today, { cents: false })} d={delta(d.kpis.revenue_today, d.kpis.revenue_yesterday)} sub={`yesterday ${compactMoney(d.kpis.revenue_yesterday)}`} />
              <Kpi label="Revenue MTD" value={money(d.kpis.revenue_mtd, { cents: false })} d={delta(d.kpis.revenue_mtd, d.kpis.revenue_prev_mtd)} sub={`last month same days ${compactMoney(d.kpis.revenue_prev_mtd)}`} />
              <Kpi label="Cars today" value={d.kpis.cars_today} d={delta(d.kpis.cars_today, d.kpis.cars_yesterday)} sub={`yesterday ${d.kpis.cars_yesterday}`} />
              <Kpi label="Cars MTD" value={d.kpis.cars_mtd.toLocaleString()} d={delta(d.kpis.cars_mtd, d.kpis.cars_prev_mtd)} sub={`prior ${d.kpis.cars_prev_mtd}`} />
              <Kpi label="Pass rate MTD" value={d.kpis.pass_rate_mtd != null ? pct(d.kpis.pass_rate_mtd) : "–"} d={delta(d.kpis.pass_rate_mtd, d.kpis.pass_rate_prev)} sub={d.kpis.pass_rate_prev != null ? `prior ${pct(d.kpis.pass_rate_prev)}` : ""} />
              <Kpi label="New leads (7d)" value={d.kpis.leads_7d} d={delta(d.kpis.leads_7d, d.kpis.leads_prev_7d)} sub={`prior 7d ${d.kpis.leads_prev_7d}`} />
              <Kpi label="Booked appointments" value={d.kpis.appointments_upcoming} sub="next 7 days" />
              <Kpi label="Open AR" value={money(d.kpis.open_ar, { cents: false })} sub={`${d.kpis.open_invoices} invoices · ${compactMoney(d.kpis.overdue_ar)} overdue`} />
              {d.kpis.net && <Kpi label="Net profit MTD" value={money(d.kpis.net.mtd, { cents: false })} d={delta(d.kpis.net.mtd, d.kpis.net.prev)} sub={`${pct(d.kpis.net.margin)} margin`} />}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card title="Revenue, last 30 days" className="lg:col-span-2"
                action={<span className="text-xs text-faint">{money(d.days.reduce((s, x) => s + x.revenue, 0), { cents: false })} · {d.days.reduce((s, x) => s + x.cars, 0)} cars</span>}>
                <div className="p-3"><TrendArea data={d.days} x="day" y="revenue" name="Revenue" fmt={(v) => compactMoney(v)} xFmt={(v) => format(new Date(v + "T12:00:00"), "MMM d")} /></div>
              </Card>
              <Card title="Cars by hour of day" action={<span className="text-xs text-faint">last 30 days</span>}>
                <div className="p-3"><Bars data={d.hours} x="hour" y="cars" name="Cars" xFmt={hourLabel} /></div>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card title="Lead funnel">
                <div className="p-4"><BarList fmt={(v) => v.toLocaleString()} rows={d.funnel.map((f) => ({ key: f.stage, label: FUNNEL_LABEL[f.stage] ?? f.stage, value: f.count }))} /></div>
              </Card>
              <Card title="Pipeline by stage" action={<span className="text-xs text-faint">monthly value</span>}>
                <div className="p-4"><BarList sub fmt={(v) => money(v, { cents: false })} rows={d.pipeline.filter((p) => p.stage !== "lost").map((p) => ({ key: p.stage, label: STAGE_LABEL[p.stage] ?? p.stage, value: p.value, sub: `${p.count} deals` }))} /></div>
              </Card>
              <Card title={<span className="flex items-center gap-1.5"><Trophy className="h-4 w-4 text-muted" />Top reps this month</span>}>
                <div className="p-2">
                  {!d.leaderboard.length ? <div className="p-2 text-sm text-faint">No commissionable payments yet this month.</div> : d.leaderboard.slice(0, 6).map((r, i) => (
                    <div key={r.id} className={cn("flex items-center gap-2 rounded px-2 py-1.5 text-sm", r.me && "bg-accent-soft")}>
                      <span className="w-4 text-xs tabular-nums text-faint">{i + 1}</span>
                      <Avatar name={r.name} color={r.color} size={20} />
                      <span className="flex-1 truncate">{r.name}</span>
                      <span className="text-right"><span className="font-medium tabular-nums">{money(r.revenue, { cents: false })}</span><span className="ml-1.5 text-xs text-faint tabular-nums">{money(r.commission, { cents: false })} comm.</span></span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card title={<span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-muted" />Today&apos;s appointments</span>} action={<Link className="text-xs text-accent hover:underline" href="/calendar">Open calendar</Link>}>
                <div className="max-h-80 overflow-auto p-2">
                  {!d.appointments.length ? <Empty title="Nothing booked today" /> : d.appointments.map((e: any) => (
                    <div key={e.id} className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-hover">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: e.calendar?.color ?? "rgb(var(--accent))" }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{e.title}</div>
                        <div className="truncate text-xs text-muted">{e.all_day ? "All day" : `${format(new Date(e.start_at), "h:mm a")} – ${format(new Date(e.end_at), "h:mm a")}`}{e.contact ? <> · <Link className="hover:underline" href={`/contacts/${e.contact.id}`}>{fullName(e.contact)}</Link></> : ""}</div>
                      </div>
                      {e.status !== "confirmed" && <Badge>{e.status}</Badge>}
                    </div>
                  ))}
                </div>
              </Card>
              <Card title={<span className="flex items-center gap-1.5"><CheckSquare className="h-4 w-4 text-muted" />Tasks due</span>} action={<Link className="text-xs text-accent hover:underline" href="/tasks">All tasks</Link>}>
                <div className="max-h-80 overflow-auto p-2">
                  {!d.tasks.length ? <Empty title="All caught up" /> : d.tasks.map((t: any) => (
                    <div key={t.id} className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-hover">
                      <Checkbox className="mt-0.5" checked={t.done} onChange={(v) => toggle.mutate({ id: t.id, done: v })} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{t.title}</div>
                        <div className="flex items-center gap-1 truncate text-xs text-muted">
                          {t.due_at && <span className={cn("flex items-center gap-0.5", isPast(new Date(t.due_at)) && "text-danger")}><Clock className="h-3 w-3" />{format(new Date(t.due_at), "MMM d, h:mm a")}</span>}
                          {t.contact && <Link className="hover:underline" href={`/contacts/${t.contact.id}`}>· {fullName(t.contact)}</Link>}
                          {t.company && <Link className="hover:underline" href={`/accounts/${t.company.id}`}>· {t.company.name}</Link>}
                        </div>
                      </div>
                      {t.assignee && d.admin && <Avatar name={t.assignee.full_name} color={t.assignee.color} size={18} />}
                    </div>
                  ))}
                </div>
              </Card>
              <Card title={<span className="flex items-center gap-1.5"><Activity className="h-4 w-4 text-muted" />Recent activity</span>}>
                <div className="max-h-80 overflow-auto p-2">
                  {!d.activity.length ? <Empty title="No activity yet" /> : d.activity.map((a: any) => (
                    <div key={a.id} className="flex items-start gap-2 rounded px-2 py-1.5 text-sm">
                      <Badge className="mt-0.5 shrink-0">{a.type.replace("_", " ")}</Badge>
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{a.subject ?? a.body}</div>
                        <div className="truncate text-xs text-faint">
                          {a.contact ? <Link className="hover:underline" href={`/contacts/${a.contact.id}`}>{fullName(a.contact)}</Link> : a.company ? <Link className="hover:underline" href={`/accounts/${a.company.id}`}>{a.company.name}</Link> : null}
                          {(a.contact || a.company) && " · "}{a.user?.full_name ? `${a.user.full_name} · ` : ""}{relTime(a.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
      <LogJobDialog open={log} onClose={() => setLog(false)} />
    </div>
  );
}
