import { router } from "@/server/trpc";
import { teamRouter } from "./team";
import { searchRouter } from "./search";
import { commsRouter } from "./comms";
import { contactsRouter } from "./contacts";
import { companiesRouter } from "./companies";
import { settingsRouter } from "./settings";
import { dealsRouter } from "./deals";
import { onboardingRouter } from "./onboarding";
import { jobsRouter } from "./jobs";
import { invoicesRouter } from "./invoices";
import { financeRouter } from "./finance";
import { commissionsRouter } from "./commissions";
import { landingRouter } from "./landing";
import { automationsRouter } from "./automations";
import { calendarRouter } from "./calendar";
import { dashboardRouter } from "./dashboard";
import { tasksRouter } from "./tasks";

export const appRouter = router({
  team: teamRouter, search: searchRouter, comms: commsRouter, contacts: contactsRouter, companies: companiesRouter,
  settings: settingsRouter, deals: dealsRouter, onboarding: onboardingRouter, jobs: jobsRouter, invoices: invoicesRouter,
  finance: financeRouter, commissions: commissionsRouter, landing: landingRouter, automations: automationsRouter,
  calendar: calendarRouter, dashboard: dashboardRouter, tasks: tasksRouter,
});
export type AppRouter = typeof appRouter;
