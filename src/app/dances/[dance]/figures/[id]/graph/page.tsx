export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { Button } from "@shared/ui/button";
import { api } from "../../../../../../../convex/_generated/api";
import { DanceGraph } from "@syllabus/components/graph/dance-graph";

export default async function FigureGraphPage({
  params,
}: {
  params: Promise<{ dance: string; id: string }>;
}) {
  const { dance: danceSlug, id: figureId } = await params;

  const dance = await fetchQuery(api.syllabus.dances.getByName, {
    name: danceSlug,
  });
  if (!dance) notFound();

  const figure = await fetchQuery(api.syllabus.figures.getDetail, {
    figureId,
  });
  if (!figure || figure.danceId !== dance.id) notFound();

  const { precedes, follows } = await fetchQuery(
    api.syllabus.figures.neighbors,
    { figureId },
  );

  // The graph shows the centre figure plus every transition neighbour.
  const centerFigure = {
    id: figure.id,
    name: figure.name,
    variantName: figure.variantName,
    level: figure.level,
    figureNumber: figure.figureNumber,
  };
  const neighborFigures = [...precedes, ...follows]
    .map((edge) => edge.figure)
    .filter((f): f is NonNullable<typeof f> => f !== null);
  const figuresById = new Map(
    [centerFigure, ...neighborFigures].map((f) => [f.id, f]),
  );
  const graphFigures = [...figuresById.values()];

  const graphEdges = [...precedes, ...follows].map((edge) => ({
    id: edge.id,
    sourceFigureId: edge.sourceFigureId,
    targetFigureId: edge.targetFigureId,
    level: edge.level,
    conditions: edge.conditions,
  }));

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
              {graphFigures.length} connected figures, {graphEdges.length} transitions
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={`/dances/${danceSlug}/figures/${figure.id}`}>
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
          figures={graphFigures}
          edges={graphEdges}
          centerFigureId={figure.id}
        />
      </div>
    </div>
  );
}
