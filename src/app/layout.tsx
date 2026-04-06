import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import { Providers } from "@shared/components/providers";
import { OnboardingGuard } from "@shared/components/onboarding-guard";
import { clerkAppearance } from "@shared/lib/clerk-appearance";
import { NotificationBell } from "@social/components/notification-bell";
import { ThemeToggle } from "@shared/components/theme-toggle";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
      <html lang="en" suppressHydrationWarning>
        <body className={`${inter.variable} font-sans antialiased`}>
          <Providers>
            <div className="min-h-screen flex flex-col">
              <header className="border-b border-border px-6 py-4">
                <nav className="max-w-7xl mx-auto flex items-center justify-between">
                  <Link href="/" className="text-xl font-bold tracking-tight">
                    World of Floorcraft
                  </Link>
                  <div className="flex items-center gap-6">
                    <Link
                      href="/dances"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Dances
                    </Link>
                    <Link
                      href="/feed"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Feed
                    </Link>
                    <Link
                      href="/routines"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Routines
                    </Link>
                    <Link
                      href="/orgs"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Organizations
                    </Link>
                    <Link
                      href="/competitions"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Competitions
                    </Link>
                    <SignedIn>
                      <Link
                        href="/messages"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Messages
                      </Link>
                    </SignedIn>
                    <SignedOut>
                      <Link
                        href="/sign-in"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Sign in
                      </Link>
                    </SignedOut>
                    <SignedIn>
                      <Link
                        href="/settings/profile"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Settings
                      </Link>
                      <NotificationBell />
                      <UserButton />
                    </SignedIn>
                    <ThemeToggle />
                  </div>
                </nav>
              </header>
              <main className="flex-1">
                <OnboardingGuard>{children}</OnboardingGuard>
              </main>
            </div>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
