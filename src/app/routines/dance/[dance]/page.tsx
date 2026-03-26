import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { dances } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { DanceRoutinesList } from "@/components/routine/dance-routines-list";

export default async function DanceRoutinesPage({
  params,
}: {
  params: Promise<{ dance: string }>;
}) {
  const { dance: danceSlug } = await params;
  const db = getDb();

  const [dance] = await db
    .select({ id: dances.id, name: dances.name, displayName: dances.displayName })
    .from(dances)
    .where(eq(dances.name, danceSlug));

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
