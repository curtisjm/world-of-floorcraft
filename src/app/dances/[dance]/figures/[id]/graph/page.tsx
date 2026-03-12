import { notFound } from "next/navigation";
import { eq, or, inArray } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db";
import { dances, figures, figureEdges } from "@/db/schema";
import { DanceGraph } from "@/components/graph/dance-graph";

export default async function FigureGraphPage({
  params,
}: {
  params: Promise<{ dance: string; id: string }>;
}) {
  const { dance: danceSlug, id: idStr } = await params;
  const figureId = parseInt(idStr, 10);
  if (isNaN(figureId)) notFound();

  const db = getDb();

  const [figure] = await db
    .select()
    .from(figures)
    .where(eq(figures.id, figureId));

  if (!figure) notFound();

  const [dance] = await db
    .select()
    .from(dances)
    .where(eq(dances.id, figure.danceId));

  // Get all edges involving this figure
  const edges = await db
    .select()
    .from(figureEdges)
    .where(
      or(
        eq(figureEdges.sourceFigureId, figureId),
        eq(figureEdges.targetFigureId, figureId)
      )
    );

  // Collect all neighbor IDs
  const neighborIds = new Set<number>();
  neighborIds.add(figureId);
  for (const edge of edges) {
    neighborIds.add(edge.sourceFigureId);
    neighborIds.add(edge.targetFigureId);
  }

  // Fetch neighbor figures
  const neighborFigures = await db
    .select({
      id: figures.id,
      name: figures.name,
      variantName: figures.variantName,
      level: figures.level,
      figureNumber: figures.figureNumber,
    })
    .from(figures)
    .where(inArray(figures.id, [...neighborIds]));

  return (
    <div className="px-6 py-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {figure.name}
              {figure.variantName && ` (${figure.variantName})`}
              {" — Local Graph"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {neighborFigures.length} connected figures, {edges.length} transitions
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <a href={`/dances/${danceSlug}/figures/${figureId}`}>
                Back to Figure
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/dances/${danceSlug}/graph`}>Full Graph</a>
            </Button>
          </div>
        </div>

        <DanceGraph
          danceSlug={danceSlug}
          figures={neighborFigures}
          edges={edges}
        />
      </div>
    </div>
  );
}
