import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db";
import { dances, figures, figureEdges } from "@/db/schema";
import { DanceGraph } from "@/components/graph/dance-graph";

export default async function DanceGraphPage({
  params,
}: {
  params: Promise<{ dance: string }>;
}) {
  const { dance: danceSlug } = await params;
  const db = getDb();

  const [dance] = await db
    .select()
    .from(dances)
    .where(eq(dances.name, danceSlug));

  if (!dance) notFound();

  const danceFigures = await db
    .select({
      id: figures.id,
      name: figures.name,
      variantName: figures.variantName,
      level: figures.level,
      figureNumber: figures.figureNumber,
    })
    .from(figures)
    .where(eq(figures.danceId, dance.id));

  const figureIds = danceFigures.map((f) => f.id);

  // Get edges where the source is in this dance (target will also be in this dance)
  const danceEdges = figureIds.length > 0
    ? await db
        .select()
        .from(figureEdges)
        .where(inArray(figureEdges.sourceFigureId, figureIds))
    : [];

  return (
    <div className="px-6 py-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {dance.displayName} — Graph
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {danceFigures.length} figures, {danceEdges.length} transitions.
              Drag nodes to rearrange. Click a figure to view details.
            </p>
          </div>
          <Button asChild variant="outline">
            <a href={`/dances/${danceSlug}`}>Back to List</a>
          </Button>
        </div>

        <DanceGraph
          danceSlug={danceSlug}
          figures={danceFigures}
          edges={danceEdges}
        />
      </div>
    </div>
  );
}
