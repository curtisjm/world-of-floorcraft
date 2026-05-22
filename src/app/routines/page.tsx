import Link from "next/link";
import { getDb } from "@shared/db";
import { dances } from "@syllabus/schema";
import { sortDancesForBrowse } from "@syllabus/components/dance/dance-order";
import {
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@shared/ui/card";

export default async function RoutinesPage() {
  const db = getDb();
  const allDances = sortDancesForBrowse(
    await db
      .select({ id: dances.id, name: dances.name, displayName: dances.displayName, timeSignature: dances.timeSignature })
      .from(dances)
  );

  return (
    <div className="atelier-shell">
      <div className="atelier-section flex flex-col gap-10">
        <div className="max-w-2xl">
          <p className="atelier-eyebrow mb-4">routine workshop</p>
          <h1 className="atelier-page-title">My Routines</h1>
          <p className="mt-3 text-muted-foreground">
            Select a dance to view and manage your routines.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allDances.map((dance) => (
            <Link key={dance.id} href={`/routines/dance/${dance.name}`}>
              <Card className="atelier-link-card cursor-pointer">
                <CardHeader>
                  <CardTitle className="font-heading text-2xl font-medium">
                    {dance.displayName}
                  </CardTitle>
                </CardHeader>
                <CardFooter className="border-t font-mono text-xs lowercase text-muted-foreground">
                  {dance.timeSignature}
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
