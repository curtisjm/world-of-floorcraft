"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@shared/lib/utils";
import { Separator } from "@shared/ui/separator";
import {
  LayoutDashboard,
  CalendarDays,
  Trophy,
  Users,
  Scale,
  Settings,
  ArrowLeft,
  ClipboardList,
  Hash,
  FileText,
  CreditCard,
  Layers,
  Calculator,
  Clock,
  BarChart3,
  Monitor,
  ClipboardCheck,
  Flag,
  Mic,
  TrendingUp,
  MessageSquare,
} from "lucide-react";

const navSections = [
  {
    label: "Setup",
    items: [
      { label: "Overview", href: "", icon: LayoutDashboard },
      { label: "Schedule", href: "/schedule", icon: CalendarDays },
      { label: "Events", href: "/events", icon: Trophy },
      { label: "Staff", href: "/staff", icon: Users },
      { label: "Judges", href: "/judges", icon: Scale },
    ],
  },
  {
    label: "Entries",
    items: [
      { label: "Registrations", href: "/registrations", icon: ClipboardList },
      { label: "Numbers", href: "/numbers", icon: Hash },
      { label: "Add/Drop", href: "/add-drop", icon: FileText },
      { label: "Payments", href: "/payments", icon: CreditCard },
    ],
  },
  {
    label: "Competition",
    items: [
      { label: "Rounds", href: "/rounds", icon: Layers },
      { label: "Scoring", href: "/scoring", icon: Calculator },
      { label: "Schedule Est.", href: "/schedule-estimation", icon: Clock },
      { label: "Stats & Awards", href: "/stats", icon: BarChart3 },
    ],
  },
  {
    label: "Comp Day",
    items: [
      { label: "Dashboard", href: "/comp-day", icon: Monitor },
      { label: "Reg. Table", href: "/comp-day/registration", icon: ClipboardCheck },
      { label: "Deck Captain", href: "/comp-day/deck-captain", icon: Flag },
      { label: "Emcee", href: "/comp-day/emcee", icon: Mic },
    ],
  },
  {
    label: "Analytics",
    items: [
      { label: "Analytics", href: "/analytics", icon: TrendingUp },
    ],
  },
  {
    label: "Post-Comp",
    items: [
      { label: "Feedback", href: "/feedback", icon: MessageSquare },
    ],
  },
  {
    label: "",
    items: [
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function DashboardNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const basePath = `/competitions/${slug}/dashboard`;

  return (
    <nav className="flex flex-col gap-1">
      {navSections.map((section, si) => (
        <div key={section.label || si}>
          {si > 0 && <Separator className="my-2" />}
          {section.label && (
            <p className="px-3 py-1 text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
              {section.label}
            </p>
          )}
          {section.items.map((item) => {
            const href = `${basePath}${item.href}`;
            const isActive =
              item.href === ""
                ? pathname === basePath
                : pathname.startsWith(href);

            return (
              <Link
                key={item.label}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="mt-4 pt-4 border-t border-border">
        <Link
          href={`/competitions/${slug}`}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4 shrink-0" />
          Back to competition
        </Link>
      </div>
    </nav>
  );
}
