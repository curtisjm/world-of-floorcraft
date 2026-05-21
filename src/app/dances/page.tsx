export const dynamic = "force-dynamic";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import Link from "next/link";
import { getDb } from "@shared/db";
import { dances, figures } from "@syllabus/schema";
import { count } from "drizzle-orm";
import { sortDancesForBrowse } from "@syllabus/components/dance/dance-order";

const DANCE_DESCRIPTIONS: Record<string, string> = {
  waltz: "The classic rise-and-fall dance in triple time",
  foxtrot: "Smooth, progressive movement across the floor",
  quickstep: "Light, fast-moving dance with hops and runs",
  tango: "Sharp, staccato movements with dramatic character",
  "viennese-waltz": "Fast, rotating waltz with continuous turning",
};

export default async function DancesPage() {
  const db = getDb();
  const allDances = await db.select().from(dances);

  // Get figure counts per dance
  const figureCounts = await db
    .select({ danceId: figures.danceId, count: count() })
    .from(figures)
    .groupBy(figures.danceId);

  const countMap = new Map(figureCounts.map((r) => [r.danceId, r.count]));
  const orderedDances = sortDancesForBrowse(allDances);

  return (
    <div className="atelier-shell">
      <div className="atelier-section flex flex-col gap-10">
        <div className="max-w-2xl">
          <p className="atelier-eyebrow mb-4">syllabus index</p>
          <h1 className="atelier-page-title">Dances</h1>
          <p className="mt-3 text-muted-foreground">
            Select a dance to explore its figures and transitions.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orderedDances.map((dance) => (
            <Link key={dance.id} href={`/dances/${dance.name}`}>
              <Card className="atelier-link-card h-full cursor-pointer">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="font-heading text-2xl font-medium">
                      {dance.displayName}
                    </CardTitle>
                    <Badge variant="secondary">{dance.timeSignature}</Badge>
                  </div>
                  <CardDescription>
                    {DANCE_DESCRIPTIONS[dance.name] ?? ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-xs lowercase text-muted-foreground">
                    {countMap.get(dance.id) ?? 0} figures
                  </p>
                </CardContent>
                <CardFooter className="mt-auto border-t text-sm text-muted-foreground">
                  Open figure atlas
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
