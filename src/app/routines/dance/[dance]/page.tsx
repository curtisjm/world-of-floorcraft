export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { Button } from "@shared/ui/button";
import { api } from "../../../../../convex/_generated/api";
import { DanceRoutinesList } from "@routines/components/dance-routines-list";

export default async function DanceRoutinesPage({
  params,
}: {
  params: Promise<{ dance: string }>;
}) {
  const { dance: danceSlug } = await params;

  const dance = await fetchQuery(api.syllabus.dances.getByName, {
    name: danceSlug,
  });
  if (!dance) notFound();

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {dance.displayName} Routines
            </h1>
            <p className="text-muted-foreground mt-2">
              Your saved routines for {dance.displayName}.
            </p>
          </div>
          <Button asChild>
            <Link href={`/routines/new?dance=${dance.name}&danceId=${dance.id}`}>
              New Routine
            </Link>
          </Button>
        </div>

        <DanceRoutinesList danceId={dance.id} danceName={dance.name} />
      </div>
    </div>
  );
}
