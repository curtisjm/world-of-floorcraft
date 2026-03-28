"use client";
import Link from "next/link";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { OrgCard } from "@orgs/components/org-card";

export default function OrgsPage() {
  const { data, isLoading } = trpc.org.discover.useQuery({ limit: 20 });

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Organizations</h1>
        <Link href="/orgs/create">
          <Button>Create Organization</Button>
        </Link>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading organizations...</p>
      ) : !data?.items.length ? (
        <p className="text-muted-foreground text-sm">No organizations yet. Be the first to create one!</p>
      ) : (
        <div className="grid gap-3">
          {data.items.map((org) => (
            <OrgCard key={org.id} org={org} />
          ))}
        </div>
      )}
    </div>
  );
}
