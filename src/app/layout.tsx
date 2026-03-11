import type { Metadata } from "next";
import { Inter } from "next/font/google";
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
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <header className="border-b border-border px-6 py-4">
              <nav className="max-w-7xl mx-auto flex items-center justify-between">
                <a href="/" className="text-xl font-bold tracking-tight">
                  Figure Graph
                </a>
                <div className="flex items-center gap-6">
                  <a
                    href="/dances"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Dances
                  </a>
                  <a
                    href="/routines"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Routines
                  </a>
                </div>
              </nav>
            </header>
            <main className="flex-1">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
