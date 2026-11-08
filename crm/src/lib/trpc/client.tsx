"use client";
import { createTRPCReact, httpBatchLink, loggerLink } from "@trpc/react-query";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { useState } from "react";
import superjson from "superjson";
import { toast } from "sonner";
import type { AppRouter } from "@/server/routers/_app";
import type { inferRouterOutputs, inferRouterInputs } from "@trpc/server";

export const trpc = createTRPCReact<AppRouter>();
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
    mutationCache: new MutationCache({
      onError: (err, _v, _c, m) => { if (!m.meta?.silent) toast.error((err as Error).message); },
      onSuccess: (_d, _v, _c, m) => { if (!m.meta?.keepCache) void qcRef.current?.invalidateQueries(); },
    }),
  }));
  qcRef.current = qc;
  const [client] = useState(() => trpc.createClient({
    links: [
      loggerLink({ enabled: (o) => process.env.NODE_ENV === "development" && o.direction === "down" && o.result instanceof Error }),
      httpBatchLink({ url: "/api/trpc", transformer: superjson }),
    ],
  }));
  return (
    <trpc.Provider client={client} queryClient={qc}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
const qcRef: { current: QueryClient | null } = { current: null };
