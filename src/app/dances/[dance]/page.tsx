import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, asc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getDb } from "@/db";
import { dances, figures } from "@/db/schema";

const LEVEL_COLORS: Record<string, string> = {
  student_teacher: "border-bronze text-bronze",
  associate: "border-bronze text-bronze",
  licentiate: "border-silver text-silver",
  fellow: "border-gold text-gold",
};

const LEVEL_LABELS: Record<string, string> = {
  student_teacher: "Student Teacher",
  associate: "Associate",
  licentiate: "Licentiate",
  fellow: "Fellow",
};

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
    .select()
    .from(figures)
    .where(eq(figures.danceId, dance.id))
    .orderBy(asc(figures.figureNumber), asc(figures.name));

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {dance.displayName}
            </h1>
            <p className="text-muted-foreground mt-2">
              {danceFigures.length} figures
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/dances/${danceSlug}/graph`}>View Graph</Link>
          </Button>
        </div>

        <Separator />

        <div className="space-y-3">
          {danceFigures.map((figure) => (
            <Link
              key={figure.id}
              href={`/dances/${danceSlug}/figures/${figure.id}`}
              className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-muted-foreground/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                {figure.figureNumber != null && (
                  <span className="text-muted-foreground text-sm font-mono w-6">
                    {figure.figureNumber}
                  </span>
                )}
                <div>
                  <span className="font-medium">{figure.name}</span>
                  {figure.variantName && (
                    <span className="text-muted-foreground ml-2 text-sm">
                      ({figure.variantName})
                    </span>
                  )}
                </div>
              </div>
              <Badge
                variant="outline"
                className={LEVEL_COLORS[figure.level]}
              >
                {LEVEL_LABELS[figure.level]}
              </Badge>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
