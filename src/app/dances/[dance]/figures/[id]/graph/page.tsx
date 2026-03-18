import { notFound } from "next/navigation";
import Link from "next/link";
import { and, eq, inArray, or } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db";
import { dances, figureEdges, figures } from "@/db/schema";
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

  const [dance] = await db
    .select()
    .from(dances)
    .where(eq(dances.name, danceSlug));

  if (!dance) notFound();

  const [figure] = await db
    .select()
    .from(figures)
    .where(and(eq(figures.id, figureId), eq(figures.danceId, dance.id)));

  if (!figure) notFound();

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
              <Link href={`/dances/${danceSlug}/figures/${figureId}`}>
                Back to Figure
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/dances/${danceSlug}/graph`}>Full Graph</Link>
            </Button>
          </div>
        </div>

        <DanceGraph
          danceSlug={danceSlug}
          figures={neighborFigures}
          edges={edges}
          centerFigureId={figureId}
        />
      </div>
    </div>
  );
}
