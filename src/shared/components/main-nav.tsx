"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { NotificationBell } from "@social/components/notification-bell";
import { ThemeToggle } from "@shared/components/theme-toggle";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@shared/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@shared/ui/sheet";
import { Separator } from "@shared/ui/separator";
import { cn } from "@shared/lib/utils";
import {
  BookOpen,
  Music,
  Route,
  Newspaper,
  PenSquare,
  Building2,
  MessageCircle,
  User,
  Bookmark,
  Settings,
  Trophy,
  Users,
  Menu,
  HeartHandshake,
} from "lucide-react";

const DANCES = [
  { name: "waltz", label: "Waltz" },
  { name: "tango", label: "Tango" },
  { name: "viennese-waltz", label: "Viennese Waltz" },
  { name: "foxtrot", label: "Foxtrot" },
  { name: "quickstep", label: "Quickstep" },
] as const;

function NavLink({
  href,
  icon: Icon,
  children,
  description,
}: {
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <NavigationMenuLink asChild>
      <Link
        href={href}
        className="flex items-center gap-2 rounded-sm p-2 text-sm transition-all outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
      >
        {Icon && <Icon className="size-4 text-muted-foreground" />}
        <div>
          <div className="font-medium">{children}</div>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </Link>
    </NavigationMenuLink>
  );
}

function MobileNavLink({
  href,
  icon: Icon,
  children,
  onClick,
}: {
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <SheetClose asChild>
      <Link
        href={href}
        onClick={onClick}
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        {Icon && <Icon className="size-4 text-muted-foreground" />}
        <span>{children}</span>
      </Link>
    </SheetClose>
  );
}

export function MainNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isSyllabusActive =
    pathname.startsWith("/dances") || pathname.startsWith("/routines");
  const isSocialActive =
    pathname.startsWith("/feed") ||
    pathname.startsWith("/orgs") ||
    pathname.startsWith("/messages") ||
    pathname.startsWith("/partners") ||
    pathname.startsWith("/posts") ||
    pathname.startsWith("/users") ||
    pathname.startsWith("/saved");

  return (
    <header className="border-b border-border px-4 py-3 md:px-6">
      <nav className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-lg font-bold tracking-tight mr-2 md:text-xl md:mr-4">
            World of Floorcraft
          </Link>

          {/* Desktop navigation */}
          <NavigationMenu className="hidden md:flex">
            <NavigationMenuList>
              {/* Syllabus dropdown */}
              <NavigationMenuItem>
                <NavigationMenuTrigger
                  className={
                    isSyllabusActive ? "text-foreground" : "text-muted-foreground"
                  }
                >
                  <BookOpen className="size-4 mr-1" />
                  Syllabus
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="w-[280px] p-2">
                    <NavLink
                      href="/dances"
                      icon={Music}
                      description="Browse all dances and their figures"
                    >
                      All Dances
                    </NavLink>
                    <div className="my-1 h-px bg-border" />
                    <div className="grid gap-0.5">
                      {DANCES.map((dance) => (
                        <NavLink
                          key={dance.name}
                          href={`/dances/${dance.name}`}
                          icon={Music}
                        >
                          {dance.label}
                        </NavLink>
                      ))}
                    </div>
                    <div className="my-1 h-px bg-border" />
                    <NavLink
                      href="/routines"
                      icon={Route}
                      description="Create and browse routines"
                    >
                      Routines
                    </NavLink>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>

              {/* Social dropdown */}
              <NavigationMenuItem>
                <NavigationMenuTrigger
                  className={
                    isSocialActive ? "text-foreground" : "text-muted-foreground"
                  }
                >
                  <Users className="size-4 mr-1" />
                  Social
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="w-[240px] p-2">
                    <NavLink
                      href="/feed"
                      icon={Newspaper}
                      description="See what the community is sharing"
                    >
                      Feed
                    </NavLink>
                    <SignedIn>
                      <NavLink href="/posts/new" icon={PenSquare}>
                        New Post
                      </NavLink>
                    </SignedIn>
                    <div className="my-1 h-px bg-border" />
                    <NavLink
                      href="/orgs"
                      icon={Building2}
                      description="Dance studios and organizations"
                    >
                      Organizations
                    </NavLink>
                    <SignedIn>
                      <NavLink href="/messages" icon={MessageCircle}>
                        Messages
                      </NavLink>
                      <NavLink
                        href="/partners"
                        icon={HeartHandshake}
                        description="Find a dance partner"
                      >
                        Partner Search
                      </NavLink>
                      <div className="my-1 h-px bg-border" />
                      <NavLink href="/settings/profile" icon={User}>
                        My Profile
                      </NavLink>
                      <NavLink href="/saved" icon={Bookmark}>
                        Saved
                      </NavLink>
                      <NavLink href="/settings/profile" icon={Settings}>
                        Settings
                      </NavLink>
                    </SignedIn>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>

              {/* Competitions — single link for now */}
              <NavigationMenuItem>
                <Link
                  href="/competitions"
                  className={cn(
                    "group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-[color,box-shadow] outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                    pathname.startsWith("/competitions")
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <Trophy className="size-4 mr-1" />
                  Competitions
                </Link>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        <div className="flex items-center gap-3">
          <SignedOut>
            <Link
              href="/sign-in"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
          </SignedOut>
          <SignedIn>
            <NotificationBell />
            <UserButton />
          </SignedIn>
          <ThemeToggle />

          {/* Mobile hamburger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors md:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 overflow-y-auto p-0">
              <SheetHeader className="p-6 pb-2">
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>

              <div className="flex flex-col px-3 pb-6">
                {/* Syllabus section */}
                <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Syllabus
                </p>
                <MobileNavLink href="/dances" icon={Music}>
                  All Dances
                </MobileNavLink>
                {DANCES.map((dance) => (
                  <MobileNavLink
                    key={dance.name}
                    href={`/dances/${dance.name}`}
                    icon={Music}
                  >
                    {dance.label}
                  </MobileNavLink>
                ))}
                <MobileNavLink href="/routines" icon={Route}>
                  Routines
                </MobileNavLink>

                <Separator className="my-3" />

                {/* Social section */}
                <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Social
                </p>
                <MobileNavLink href="/feed" icon={Newspaper}>
                  Feed
                </MobileNavLink>
                <SignedIn>
                  <MobileNavLink href="/posts/new" icon={PenSquare}>
                    New Post
                  </MobileNavLink>
                </SignedIn>
                <MobileNavLink href="/orgs" icon={Building2}>
                  Organizations
                </MobileNavLink>
                <SignedIn>
                  <MobileNavLink href="/messages" icon={MessageCircle}>
                    Messages
                  </MobileNavLink>
                  <MobileNavLink href="/partners" icon={HeartHandshake}>
                    Partner Search
                  </MobileNavLink>
                </SignedIn>

                <Separator className="my-3" />

                {/* Competitions */}
                <MobileNavLink href="/competitions" icon={Trophy}>
                  Competitions
                </MobileNavLink>

                {/* Account section (signed in) */}
                <SignedIn>
                  <Separator className="my-3" />
                  <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Account
                  </p>
                  <MobileNavLink href="/settings/profile" icon={User}>
                    My Profile
                  </MobileNavLink>
                  <MobileNavLink href="/saved" icon={Bookmark}>
                    Saved
                  </MobileNavLink>
                  <MobileNavLink href="/settings/profile" icon={Settings}>
                    Settings
                  </MobileNavLink>
                </SignedIn>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
