import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Figure Graph",
  description:
    "Interactive visualization of the ISTD ballroom dance syllabus",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: {
          colorBackground: "#262626",
          colorInputBackground: "#1a1a1a",
          colorInputText: "#fafafa",
          colorPrimary: "#fafafa",
          colorText: "#fafafa",
          colorTextSecondary: "#a1a1a1",
          colorNeutral: "#a1a1a1",
          borderRadius: "0.5rem",
        },
      }}
    >
      <html lang="en" className="dark">
        <body className={`${inter.variable} font-sans antialiased`}>
          <Providers>
            <div className="min-h-screen flex flex-col">
              <header className="border-b border-border px-6 py-4">
                <nav className="max-w-7xl mx-auto flex items-center justify-between">
                  <Link href="/" className="text-xl font-bold tracking-tight">
                    Figure Graph
                  </Link>
                  <div className="flex items-center gap-6">
                    <Link
                      href="/dances"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Dances
                    </Link>
                    <Link
                      href="/routines"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Routines
                    </Link>
                    <SignedOut>
                      <Link
                        href="/sign-in"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Sign in
                      </Link>
                    </SignedOut>
                    <SignedIn>
                      <UserButton />
                    </SignedIn>
                  </div>
                </nav>
              </header>
              <main className="flex-1">{children}</main>
            </div>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
