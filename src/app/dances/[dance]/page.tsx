import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, asc } from "drizzle-orm";
import { Button } from "@shared/ui/button";
import { getDb } from "@shared/db";
import { dances, figures } from "@syllabus/schema";
import { FigureListFilters } from "@syllabus/components/dance/figure-list-filters";

export default async function DancePage({
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
    .where(eq(figures.danceId, dance.id))
    .orderBy(asc(figures.figureNumber), asc(figures.name));

  return (
    <div className="atelier-shell py-10 sm:py-14">
      <div className="space-y-10">
        <div className="border-b border-border pb-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="atelier-eyebrow mb-5">syllabus index</p>
            <h1 className="atelier-display-title">
              {dance.displayName}
            </h1>
          </div>
          <Button asChild variant="outline">
            <Link href={`/dances/${danceSlug}/graph`}>View Graph</Link>
          </Button>
          </div>
        </div>

        <FigureListFilters danceSlug={danceSlug} figures={danceFigures} />
      </div>
    </div>
  );
}
