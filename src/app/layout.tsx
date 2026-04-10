import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@shared/components/providers";
import { OnboardingGuard } from "@shared/components/onboarding-guard";
import { clerkAppearance } from "@shared/lib/clerk-appearance";
import { MainNav } from "@shared/components/main-nav";
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
              <MainNav />
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
