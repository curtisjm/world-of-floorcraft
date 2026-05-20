import type { Metadata } from "next";
import { IBM_Plex_Mono, Newsreader, Source_Sans_3 } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@shared/components/providers";
import { OnboardingGuard } from "@shared/components/onboarding-guard";
import { clerkAppearance } from "@shared/lib/clerk-appearance";
import { MainNav } from "@shared/components/main-nav";
import { cn } from "@shared/lib/utils";
import "./globals.css";

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body",
  weight: "variable",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-display",
  weight: "variable",
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-code",
  weight: ["400", "500", "600"],
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
          sourceSans.variable,
          newsreader.variable,
          ibmPlexMono.variable,
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
