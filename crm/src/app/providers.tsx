"use client";
import { Toaster } from "sonner";
import { TRPCProvider } from "@/lib/trpc/client";
import { ThemeProvider } from "@/components/layout/theme";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <TRPCProvider>
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </TRPCProvider>
    </ThemeProvider>
  );
}
