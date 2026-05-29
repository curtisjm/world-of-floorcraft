"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@shared/ui/button";
import { Skeleton } from "@shared/ui/skeleton";
import { StatusBadge } from "@competitions/components/status-badge";
import { toast } from "sonner";
import {
  Trophy,
  Users,
  Scale,
  CalendarDays,
  CheckCircle2,
  Circle,
  AlertTriangle,
} from "lucide-react";

const statusTransitions: Record<string, { label: string; next: string }[]> = {
  draft: [{ label: "Advertise", next: "advertised" }],
  advertised: [{ label: "Open Entries", next: "accepting_entries" }],
  accepting_entries: [{ label: "Close Entries", next: "entries_closed" }],
  entries_closed: [
    { label: "Start Competition", next: "running" },
    { label: "Reopen Entries", next: "accepting_entries" },
  ],
  running: [{ label: "Finish", next: "finished" }],
  finished: [],
};

export default function DashboardOverviewPage() {
  const { slug } = useParams<{ slug: string }>();
  const comp = useQuery(api.competitions.core.getBySlug, { slug, includeArchived: true });
  const dashboard = useQuery(
    api.competitions.core.getForDashboard,
    comp ? { competitionId: comp._id } : "skip",
  );
  const setup = useQuery(
    api.competitions.core.setupStatus,
    comp ? { competitionId: comp._id } : "skip",
  );
  const isLoading = comp === undefined || dashboard === undefined;

  const statusMutation = useMutation(api.competitions.core.updateStatus);

  if (isLoading || !comp) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-none" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-none" />
      </div>
    );
  }

  const transitions = statusTransitions[comp.status] ?? [];

  const staffDetail = setup?.staffDetail;
  const staffParts = staffDetail
    ? [
        staffDetail.scrutineer >= 1 ? null : "scrutineer",
        staffDetail.emcee >= 1 ? null : "emcee",
        staffDetail.chairman >= 1 ? null : "chairman",
        staffDetail.dj >= 1 ? null : "DJ",
        staffDetail.judges >= 5 ? null : `judges (${staffDetail.judges}/5)`,
      ].filter(Boolean)
    : [];

  const checklist = [
    {
      label: "Set up schedule",
      done: setup?.hasSchedule ?? false,
      href: `/competitions/${slug}/dashboard/schedule`,
    },
    {
      label: "Configure events",
      done: setup?.hasEvents ?? false,
      href: `/competitions/${slug}/dashboard/events`,
    },
    {
      label: "Assign staff",
      done: setup?.staffComplete ?? false,
      detail: setup?.staffComplete
        ? undefined
        : staffParts.length > 0
          ? `Need: ${staffParts.join(", ")}`
          : undefined,
      href: `/competitions/${slug}/dashboard/staff`,
    },
    {
      label: "Open registration",
      done: setup?.registrationOpen ?? false,
      href: `/competitions/${slug}/dashboard/registrations`,
    },
    {
      label: "Assign competitor numbers",
      done: setup?.numbersAssigned ?? false,
      detail:
        (setup?.numbersDetail?.total ?? 0) > 0
          ? `${setup!.numbersDetail.assigned}/${setup!.numbersDetail.total} assigned`
          : undefined,
      href: `/competitions/${slug}/dashboard/numbers`,
    },
    {
      label: "Finalize heats",
      done: setup?.heatsFinalized ?? false,
      detail:
        (setup?.heatsDetail?.eventsWithEntries ?? 0) > 0
          ? `${setup!.heatsDetail.eventsWithRounds}/${setup!.heatsDetail.eventsWithEntries} events ready`
          : undefined,
      href: `/competitions/${slug}/dashboard/events`,
    },
  ];

  const completedSteps = checklist.filter((c) => c.done).length;

  return (
    <div className="space-y-6">
      {/* Status controls */}
      {transitions.length > 0 && (
        <Card>
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Current status
              </p>
              <StatusBadge status={comp.status} className="mt-1" />
            </div>
            <div className="flex gap-2">
              {transitions.map((t) => (
                <Button
                  key={t.next}
                  variant={t.next === "accepting_entries" ? "outline" : "default"}
                  size="sm"
                  onClick={async () => {
                    if (
                      t.next === "running" &&
                      !confirm("Start the competition? This enables live judging.")
                    ) {
                      return;
                    }
                    try {
                      await statusMutation({
                        competitionId: comp._id,
                        status: t.next as "draft" | "advertised" | "accepting_entries" | "entries_closed" | "running" | "finished",
                      });
                      toast.success("Status updated");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed");
                    }
                  }}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Events"
          value={dashboard?.eventCount ?? 0}
          icon={Trophy}
          href={`/competitions/${slug}/dashboard/events`}
        />
        <StatCard
          label="Schedule Days"
          value={dashboard?.days?.length ?? 0}
          icon={CalendarDays}
          href={`/competitions/${slug}/dashboard/schedule`}
        />
        <StatCard
          label="Judges"
          value={dashboard?.judgeCount ?? 0}
          icon={Scale}
          href={`/competitions/${slug}/dashboard/judges`}
        />
        <StatCard
          label="Staff"
          value={dashboard?.staffCount ?? 0}
          icon={Users}
          href={`/competitions/${slug}/dashboard/staff`}
        />
      </div>

      {/* Setup checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Setup Progress ({completedSteps}/{checklist.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {checklist.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-3 rounded-[2px] border border-transparent p-2 transition-colors hover:border-border hover:bg-accent/50"
              >
                {item.done ? (
                  <CheckCircle2 className="size-5 shrink-0 text-sage" />
                ) : (
                  <Circle className="size-5 text-muted-foreground/40 shrink-0" />
                )}
                <span
                  className={
                    item.done ? "text-muted-foreground" : "font-medium"
                  }
                >
                  {item.label}
                </span>
                {"detail" in item && item.detail && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {item.detail}
                  </span>
                )}
              </Link>
            ))}
          </div>

          {comp.status === "draft" && completedSteps < checklist.length && (
            <div className="mt-4 flex items-start gap-2 rounded-[2px] border border-clay/40 bg-clay/10 p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-clay" />
              <p className="text-sm text-clay">
                Complete all setup steps before advertising your competition.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
            </div>
            <Icon className="size-8 text-muted-foreground/50" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
