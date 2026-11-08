# Newport Smog CRM: architecture

CRM for **Newport Smog & Auto Registration** (STAR test-only smog station + DMV services, Costa Mesa CA).
Customers = retail drivers (contacts with vehicles) and **partner accounts** (dealers, rentals, exotic/repair shops, fleets) who get partner pricing and month-end billing.

## Stack
- Next.js 15 App Router (`src/app`), React 19, TypeScript strict, Tailwind 3 with CSS-variable tokens (see `tailwind.config.ts`, `src/app/globals.css`).
- tRPC 11 (`@trpc/react-query` classic API): client `import { trpc } from "@/lib/trpc/client"` → `trpc.contacts.list.useQuery(...)`, `trpc.x.y.useMutation()`.
  Every successful mutation invalidates all queries automatically (see `src/lib/trpc/client.tsx`), and errors toast automatically, so pages don't need manual invalidation.
- Supabase Postgres. Server code uses the **service role** client `db()` from `@/lib/supabase/admin` (RLS is on with no public policies; authorization happens in tRPC procedures).
  In routers use `ctx.db`, `ctx.profile` (`role: owner|admin|rep`), and `must(await query)` to unwrap/throw.
  Procedures: `protectedProcedure` (any active staff), `adminProcedure` (owner/admin). Reps should only see their own records where noted.
- Schema: `supabase/migrations/0001_crm_core.sql` (read it). Every business table has `is_demo boolean` for demo data.
  FK embed names when ambiguous: `owner:profiles!contacts_owner_id_fkey(...)`, `profiles!companies_owner_id_fkey`, `profiles!deals_owner_id_fkey`.
- Integrations in `src/lib/integrations/*` (telnyx, resend, calendly, pandadoc, mercury, openrouter). They throw `IntegrationError` with a readable message when env keys are missing, which shows as a toast. Never mock success.
- Services in `src/server/services/*`:
  - `comms.ts`: `sendSmsToContact`, `sendEmailToContact`, `logActivity`, `findContact`.
  - `leads.ts`: `createLead` (dedupe, rep routing, fires automations).
  - `routing.ts`: `pickRep`.
  - `automations.ts`: `fireTrigger(trigger, contactId, payload)`, `enroll`, `processRun`, `processDue`, `stopOnReply`. Graph = React Flow nodes/edges.
  - `billing.ts`: `generateMonthlyInvoices`, `sendInvoice`, `recordPayment` (accrues commission), `syncMercury`, `markOverdue`.
  - `ai.ts`: `contactOverview`, `companyOverview`, `draftMessage`, `businessInsights`.

## UI conventions (Twenty CRM look)
- Import primitives from `@/components/ui`: Button, IconButton, Input, Textarea, Select, Field, Switch, Checkbox, Badge, StatusBadge, Avatar, Card, Stat, Loading, Empty, Dialog, Drawer, Menu, MenuItem, Tabs, PageHeader, Toolbar, Table/Th/Td, Markdown, confirmAction.
- Helpers in `@/lib/utils`: cn, money, compactMoney, pct, fmtPhone, toE164, fullName, relTime, shortDate, dealNo (NS-1001), jobNo, invNo, colorFor, renderTemplate.
- Icons: `lucide-react`. Dialer: `const { call } = useDialer()` from `@/components/dialer/dialer`, then `call({ number, contactId, companyId, name })`.
- Pages live under `src/app/(app)/<route>/page.tsx` as `"use client"` components. Layout: `<div className="flex h-full flex-col"><PageHeader .../><Toolbar/>…scrollable body (flex-1 overflow-auto)</div>`.
- Dense 13px text, 1px borders (`border-border`), neutral backgrounds (`bg-bg`, `bg-panel`, `bg-subtle`), accent blue for primary actions. Must look good in light and dark mode (use tokens, never hard-coded grays).
- **Every button must do something real.** No placeholder handlers, no "coming soon".

## Pricing (from the shop's own price sheet)
Passenger $73 + $8.25 certificate (no-pass $73). Vans $83. Exotics and Sprinter $93. Old cars (pre-2000) $118. Old luxury $198.
Retest $43 + $8.25 ($63 for old cars). Partner prices vary per account (stored on `companies.smog_price` etc).
