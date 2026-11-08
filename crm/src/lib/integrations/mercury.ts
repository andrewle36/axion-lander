import "server-only";
import { env, requireKey } from "@/lib/env";
import { api } from "./http";
const BASE = "https://api.mercury.com/api/v1";
const auth = () => ({ Authorization: `Bearer ${requireKey("Mercury", env.mercuryToken, "MERCURY_API_TOKEN")}` });

export type MercuryAccount = { id: string; name: string; availableBalance: number; currentBalance: number; kind: string; status: string; accountNumber?: string };
export type MercuryTxn = { id: string; amount: number; postedAt: string | null; createdAt: string; counterpartyName: string | null; bankDescription: string | null; note: string | null; status: string; kind: string };

export async function accounts() {
  const r = await api<{ accounts: MercuryAccount[] }>("Mercury", `${BASE}/accounts`, { headers: auth() });
  return r.accounts;
}
export async function transactions(accountId: string, start: string) {
  const out: MercuryTxn[] = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const r = await api<{ transactions: MercuryTxn[]; total: number }>("Mercury", `${BASE}/account/${accountId}/transactions?limit=500&offset=${offset}&start=${start}`, { headers: auth() });
    out.push(...r.transactions);
    if (r.transactions.length < 500) break;
  }
  return out;
}
/* ---------- Accounts Receivable (invoicing) ---------- */
export async function createCustomer(name: string, email: string) {
  const r = await api<{ id: string }>("Mercury", `${BASE}/ar/customers`, { method: "POST", headers: auth(), json: { name, email } });
  return r.id;
}
export async function createInvoice(opts: {
  customerId: string; invoiceDate: string; dueDate: string; number: string;
  lineItems: { name: string; unitPrice: number; quantity: number }[]; memo?: string; send: boolean;
}) {
  const destinationAccountId = env.mercuryAccount || (await accounts()).find((a) => a.kind?.toLowerCase().includes("checking"))?.id;
  const r = await api<Record<string, any>>("Mercury", `${BASE}/ar/invoices`, {
    method: "POST", headers: auth(),
    json: {
      customerId: opts.customerId, invoiceDate: opts.invoiceDate, dueDate: opts.dueDate, invoiceNumber: opts.number,
      lineItems: opts.lineItems, payerMemo: opts.memo, destinationAccountId,
      achDebitEnabled: true, creditCardEnabled: true, useRealAccountNumber: false,
      sendEmailOption: opts.send ? "SendNow" : "DontSend",
    },
  });
  const payUrl: string | null = r.paymentUrl ?? r.invoiceUrl ?? r.url ?? (r.slug ? `https://app.mercury.com/pay/${r.slug}` : null);
  return { id: String(r.id), payUrl, raw: r };
}
export async function getInvoice(id: string) {
  return api<Record<string, any>>("Mercury", `${BASE}/ar/invoices/${id}`, { headers: auth() });
}
export async function cancelInvoice(id: string) {
  return api("Mercury", `${BASE}/ar/invoices/${id}/cancel`, { method: "POST", headers: auth() });
}
