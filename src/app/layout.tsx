import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@shared/components/providers";
import { OnboardingGuard } from "@shared/components/onboarding-guard";
import { clerkAppearance } from "@shared/lib/clerk-appearance";
import { MainNav } from "@shared/components/main-nav";
import { cn } from "@shared/lib/utils";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  weight: "variable",
  axes: ["opsz"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-display",
  weight: "variable",
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-code",
  weight: "variable",
  display: "swap",
});

export const metadata: Metadata = {
  title: "World of Floorcraft",
  description:
    "Interactive visualization of the ISTD ballroom dance syllabus",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html
        lang="en"
        suppressHydrationWarning
        className={cn(
          inter.variable,
          sourceSerif.variable,
          jetBrainsMono.variable,
        )}
      >
        <body className="font-sans antialiased">
          <Providers>
            <div className="min-h-screen flex flex-col">
              <MainNav />
              <main className="flex-1 bg-background">
                <OnboardingGuard>{children}</OnboardingGuard>
              </main>
            </div>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
