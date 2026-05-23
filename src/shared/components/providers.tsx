"use client";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@shared/ui/tooltip";
import { Toaster } from "@shared/ui/sonner";
import { ConvexClientProvider } from "@shared/components/convex-client-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ConvexClientProvider>
        <TooltipProvider>
          {children}
          <Toaster richColors closeButton />
        </TooltipProvider>
      </ConvexClientProvider>
    </ThemeProvider>
  );
}
