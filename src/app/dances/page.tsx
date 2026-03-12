export const dynamic = "force-dynamic";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { getDb } from "@/db";
import { dances, figures } from "@/db/schema";
import { count } from "drizzle-orm";

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

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dances</h1>
          <p className="text-muted-foreground mt-2">
            Select a dance to explore its figures and transitions.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allDances.map((dance) => (
            <Link key={dance.id} href={`/dances/${dance.name}`}>
              <Card className="hover:border-muted-foreground/50 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">
                      {dance.displayName}
                    </CardTitle>
                    <Badge variant="secondary">{dance.timeSignature}</Badge>
                  </div>
                  <CardDescription>
                    {DANCE_DESCRIPTIONS[dance.name] ?? ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {countMap.get(dance.id) ?? 0} figures
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
