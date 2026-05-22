export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { Button } from "@shared/ui/button";
import { api } from "../../../../../convex/_generated/api";
import { DanceGraph } from "@syllabus/components/graph/dance-graph";

export default async function DanceGraphPage({
  params,
}: {
  params: Promise<{ dance: string }>;
}) {
  const { dance: danceSlug } = await params;

  const dance = await fetchQuery(api.syllabus.dances.getByName, {
    name: danceSlug,
  });
  if (!dance) notFound();

  const { figures, edges } = await fetchQuery(api.syllabus.figures.danceGraph, {
    danceId: dance.id,
  });

  return (
    <div className="px-6 py-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {dance.displayName} — Graph
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {figures.length} figures, {edges.length} transitions.
              Drag nodes to rearrange. Click a figure to view details.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/dances/${danceSlug}`}>Back to List</Link>
          </Button>
        </div>

        <DanceGraph
          danceSlug={danceSlug}
          figures={figures}
          edges={edges}
        />
      </div>
    </div>
  );
}
