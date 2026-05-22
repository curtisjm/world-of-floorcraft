"use client";
import Link from "next/link";
import { usePaginatedQuery } from "convex/react";
import { Button } from "@shared/ui/button";
import { OrgCard } from "@orgs/components/org-card";
import { api } from "../../../convex/_generated/api";

export default function OrgsPage() {
  const { results, status } = usePaginatedQuery(
    api.orgs.discover,
    {},
    { initialNumItems: 20 },
  );

  const loading = status === "LoadingFirstPage";

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Organizations</h1>
        <Link href="/orgs/create">
          <Button>Create Organization</Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading organizations...</p>
      ) : results.length === 0 ? (
        <p className="text-muted-foreground text-sm">No organizations yet. Be the first to create one!</p>
      ) : (
        <div className="grid gap-3">
          {results.map((org) => (
            <OrgCard
              key={org._id}
              org={{
                slug: org.slug,
                name: org.name,
                description: org.description,
                avatarUrl: org.avatarUrl,
                memberCount: org.memberCount,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
