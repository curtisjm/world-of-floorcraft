"use client";

import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { DashboardNav } from "@competitions/components/dashboard-nav";
import { StatusBadge } from "@competitions/components/status-badge";
import { Skeleton } from "@shared/ui/skeleton";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp, isLoading } = trpc.competition.getBySlug.useQuery({ slug });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="flex gap-8">
          <div className="w-48 shrink-0 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
          <div className="flex-1">
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!comp) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <p className="text-muted-foreground">Competition not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center gap-4 mb-8">
        <h1 className="text-2xl font-bold">{comp.name}</h1>
        <StatusBadge status={comp.status} />
      </div>
      <div className="flex gap-8">
        <aside className="w-48 shrink-0 hidden md:block">
          <DashboardNav slug={slug} />
        </aside>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
