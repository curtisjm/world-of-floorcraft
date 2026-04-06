"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Separator } from "@shared/ui/separator";
import { Skeleton } from "@shared/ui/skeleton";
import { StatusBadge } from "@competitions/components/status-badge";
import {
  MapPin,
  Building2,
  LayoutDashboard,
  ScrollText,
  UserPlus,
  ClipboardList,
  Trophy,
  Users,
  MessageSquare,
  FileText,
} from "lucide-react";

export default function CompetitionPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useUser();
  const { data: comp, isLoading } = trpc.competition.getBySlug.useQuery({ slug });

  // Check if current user is an admin of the competition's org
  const { data: membershipData } = trpc.membership.getMyMembership.useQuery(
    { orgId: comp?.orgId ?? 0 },
    { enabled: !!comp && !!user },
  );

  const isAdmin =
    membershipData?.isOwner || membershipData?.membership?.role === "admin";

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  if (!comp) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-muted-foreground">Competition not found.</p>
      </div>
    );
  }

  const location = [
    comp.venueName,
    comp.streetAddress,
    [comp.city, comp.state].filter(Boolean).join(", "),
    comp.zip,
    comp.country,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{comp.name}</h1>
            <StatusBadge status={comp.status} />
          </div>
          <Link
            href={`/orgs/${comp.orgSlug}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Building2 className="size-3.5" />
            {comp.orgName}
          </Link>
        </div>
        {isAdmin && (
          <Link href={`/competitions/${slug}/dashboard`}>
            <Button>
              <LayoutDashboard className="size-4 mr-2" />
              Dashboard
            </Button>
          </Link>
        )}
      </div>

      <div className="space-y-6">
        {/* Description */}
        {comp.description && (
          <section>
            <p className="text-muted-foreground whitespace-pre-wrap">
              {comp.description}
            </p>
          </section>
        )}

        {/* Venue */}
        {location && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="size-4" />
                Venue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-line">{location}</p>
              {comp.venueNotes && (
                <p className="text-sm text-muted-foreground mt-2">
                  {comp.venueNotes}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Rules */}
        {comp.rules && (
          <>
            <Separator />
            <section>
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
                <ScrollText className="size-5" />
                Rules
              </h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {comp.rules}
              </p>
            </section>
          </>
        )}

        {/* Pricing */}
        {comp.baseFee && Number(comp.baseFee) > 0 && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Entry fee: <span className="font-medium text-foreground">${comp.baseFee}</span>
              </p>
            </CardContent>
          </Card>
        )}

        {/* Quick Links */}
        <Separator />
        <section>
          <h2 className="text-lg font-semibold mb-3">Quick Links</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {comp.status === "accepting_entries" && (
              <QuickLink href={`/competitions/${slug}/register`} icon={UserPlus} label="Register" />
            )}
            <QuickLink href={`/competitions/${slug}/entries`} icon={ClipboardList} label="View Entries" />
            <QuickLink href={`/competitions/${slug}/results`} icon={Trophy} label="Results" />
            <QuickLink href={`/competitions/${slug}/tba`} icon={Users} label="Partner Finder (TBA)" />
            <QuickLink href={`/competitions/${slug}/team-match`} icon={MessageSquare} label="Team Match" />
            {(comp.status === "entries_closed" || comp.status === "running") && (
              <QuickLink href={`/competitions/${slug}/add-drop`} icon={FileText} label="Add/Drop Form" />
            )}
            {comp.status === "running" && (
              <QuickLink href={`/competitions/${slug}/live`} icon={Trophy} label="Live View" />
            )}
            {comp.status === "finished" && (
              <QuickLink href={`/competitions/${slug}/feedback`} icon={MessageSquare} label="Give Feedback" />
            )}
            {membershipData?.membership && comp.orgSlug && (
              <QuickLink
                href={`/orgs/${comp.orgSlug}/competitions/${slug}`}
                icon={Building2}
                label="My Org's View"
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
    >
      <Icon className="size-4 text-muted-foreground shrink-0" />
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}
