export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { Button } from "@shared/ui/button";
import { api } from "../../../../convex/_generated/api";
import { FigureListFilters } from "@syllabus/components/dance/figure-list-filters";

export default async function DancePage({
  params,
}: {
  params: Promise<{ dance: string }>;
}) {
  const { dance: danceSlug } = await params;

  const dance = await fetchQuery(api.syllabus.dances.getByName, {
    name: danceSlug,
  });
  if (!dance) notFound();

  const danceFigures = await fetchQuery(api.syllabus.figures.listByDance, {
    danceId: dance.id,
  });

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
