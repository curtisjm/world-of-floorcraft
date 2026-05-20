import { notFound } from "next/navigation";
import Link from "next/link";
import { and, eq, or } from "drizzle-orm";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@shared/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { getDb } from "@shared/db";
import { dances, figures, figureEdges } from "@syllabus/schema";

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

interface Step {
  step_number: number;
  feet_position: string;
  alignment: string;
  amount_of_turn: string | null;
  rise_and_fall: string | null;
}

function StepTable({ steps }: { steps: Step[] }) {
  return (
    <div className="atelier-panel overflow-x-auto">
      <table className="atelier-data-table min-w-[56rem] text-sm">
        <thead>
          <tr>
            <th>#</th>
            <th>position</th>
            <th>alignment</th>
            <th>turn</th>
            <th>rise & fall</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr key={step.step_number}>
              <td className="num-cell">
                {step.step_number}
              </td>
              <td>{step.feet_position}</td>
              <td>{step.alignment}</td>
              <td>{step.amount_of_turn ?? "—"}</td>
              <td>{step.rise_and_fall ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TechDetails({
  footwork,
  cbm,
  sway,
}: {
  footwork: string | null;
  cbm: string | null;
  sway: string | null;
}) {
  return (
    <div className="grid gap-px border border-border bg-border text-sm sm:grid-cols-3">
      <div>
        <div className="bg-card p-4">
          <span className="font-medium text-foreground">Footwork:</span>{" "}
          <span className="text-muted-foreground">{footwork ?? "—"}</span>
        </div>
      </div>
      <div>
        <div className="bg-card p-4">
          <span className="font-medium text-foreground">CBM:</span>{" "}
          <span className="text-muted-foreground">{cbm ?? "—"}</span>
        </div>
      </div>
      <div>
        <div className="bg-card p-4">
          <span className="font-medium text-foreground">Sway:</span>{" "}
          <span className="text-muted-foreground">{sway ?? "—"}</span>
        </div>
      </div>
    </div>
  );
}

export default async function FigureDetailPage({
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

  // Get edges and resolve figure names
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
  for (const edge of edges) {
    neighborIds.add(edge.sourceFigureId);
    neighborIds.add(edge.targetFigureId);
  }
  neighborIds.delete(figureId);

  // Fetch neighbor names
  const neighborMap = new Map<number, { name: string; variantName: string | null; level: string }>();
  if (neighborIds.size > 0) {
    const neighbors = await db
      .select({
        id: figures.id,
        name: figures.name,
        variantName: figures.variantName,
        level: figures.level,
      })
      .from(figures)
      .where(
        or(...[...neighborIds].map((nid) => eq(figures.id, nid)))
      );
    for (const n of neighbors) {
      neighborMap.set(n.id, n);
    }
  }

  const precedeEdges = edges.filter((e) => e.targetFigureId === figureId);
  const followEdges = edges.filter((e) => e.sourceFigureId === figureId);

  const leaderSteps = figure.leaderSteps as Step[] | null;
  const followerSteps = figure.followerSteps as Step[] | null;

  return (
    <div className="atelier-shell py-10 sm:py-14">
      <section className="border-b border-border pb-14">
        <div className="atelier-section-head">
          <span className="font-mono text-xs lowercase text-muted-foreground">
            fig.{figure.figureNumber ?? figure.id.toString().padStart(3, "0")}
          </span>
          <div className="flex min-w-0 flex-col gap-8">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="mb-5 flex flex-wrap items-center gap-3">
                  <Badge
                    variant="outline"
                    className={LEVEL_COLORS[figure.level]}
                  >
                    {LEVEL_LABELS[figure.level]}
                  </Badge>
                  <span className="font-mono text-xs lowercase text-muted-foreground">
                    {dance?.displayName}
                    {figure.timing && ` · ${figure.timing}`}
                    {figure.beatValue && ` · beat ${figure.beatValue}`}
                  </span>
                </div>
                <h1 className="atelier-display-title max-w-5xl">
                  {figure.name}
                  {figure.variantName && (
                    <span className="muted text-muted-foreground">
                      {" "}
                      ({figure.variantName})
                    </span>
                  )}
                </h1>
              </div>
              <div className="flex flex-wrap gap-2 lg:pt-8">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/dances/${danceSlug}/figures/${figureId}/graph`}>
                    Local graph
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/dances/${danceSlug}`}>Back to {dance?.displayName}</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-10 py-12">
        {/* Step charts */}
        {(leaderSteps || followerSteps) && (
          <section className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-xs lowercase text-muted-foreground">
                  syllabus chart
                </p>
                <h2 className="mt-2 font-heading text-2xl font-medium">
                  Steps
                </h2>
              </div>
            </div>

            <Tabs defaultValue="leader">
              <TabsList>
                <TabsTrigger value="leader">Leader&apos;s Steps</TabsTrigger>
                <TabsTrigger value="follower">Follower&apos;s Steps</TabsTrigger>
              </TabsList>

              <TabsContent value="leader" className="mt-5 space-y-4">
                {leaderSteps && leaderSteps.length > 0 ? (
                  <>
                    <StepTable steps={leaderSteps} />
                    <TechDetails
                      footwork={figure.leaderFootwork}
                      cbm={figure.leaderCbm}
                      sway={figure.leaderSway}
                    />
                  </>
                ) : (
                  <p className="atelier-panel p-6 text-sm text-muted-foreground">
                    No step data available; see base figure.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="follower" className="mt-5 space-y-4">
                {followerSteps && followerSteps.length > 0 ? (
                  <>
                    <StepTable steps={followerSteps} />
                    <TechDetails
                      footwork={figure.followerFootwork}
                      cbm={figure.followerCbm}
                      sway={figure.followerSway}
                    />
                  </>
                ) : (
                  <p className="atelier-panel p-6 text-sm text-muted-foreground">
                    No step data available; see base figure.
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </section>
        )}

        {/* Notes */}
        {figure.notes && (figure.notes as string[]).length > 0 && (
          <Card className="gap-0 py-0">
            <CardHeader className="border-b bg-secondary px-6 py-4">
              <CardTitle className="font-mono text-xs font-medium lowercase text-muted-foreground">
                notes
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 py-6">
              <ul className="space-y-4 text-[0.95rem] leading-relaxed text-muted-foreground">
                {(figure.notes as string[]).map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Precede / Follow */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b bg-secondary px-6 py-4">
              <CardTitle className="font-mono text-xs font-medium lowercase text-muted-foreground">
                preceded by ({precedeEdges.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {precedeEdges.length > 0 ? (
                <ul className="divide-y divide-border">
                  {precedeEdges.map((edge) => {
                    const neighbor = neighborMap.get(edge.sourceFigureId);
                    return (
                      <li key={edge.id} className="grid gap-3 px-6 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <Link
                          href={`/dances/${danceSlug}/figures/${edge.sourceFigureId}`}
                          className="font-heading text-base font-medium text-foreground transition-colors hover:text-muted-foreground"
                        >
                          {neighbor?.name ?? `Figure #${edge.sourceFigureId}`}
                          {neighbor?.variantName && ` (${neighbor.variantName})`}
                        </Link>
                        <div className="flex items-center gap-2 sm:justify-end">
                          {edge.conditions && (
                            <span className="max-w-[20rem] text-xs text-muted-foreground">
                              {edge.conditions}
                            </span>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-xs ${LEVEL_COLORS[edge.level]}`}
                          >
                            {LEVEL_LABELS[edge.level]?.[0]}
                          </Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-6 py-5 text-sm text-muted-foreground">
                  No precede data available.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b bg-secondary px-6 py-4">
              <CardTitle className="font-mono text-xs font-medium lowercase text-muted-foreground">
                followed by ({followEdges.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {followEdges.length > 0 ? (
                <ul className="divide-y divide-border">
                  {followEdges.map((edge) => {
                    const neighbor = neighborMap.get(edge.targetFigureId);
                    return (
                      <li key={edge.id} className="grid gap-3 px-6 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <Link
                          href={`/dances/${danceSlug}/figures/${edge.targetFigureId}`}
                          className="font-heading text-base font-medium text-foreground transition-colors hover:text-muted-foreground"
                        >
                          {neighbor?.name ?? `Figure #${edge.targetFigureId}`}
                          {neighbor?.variantName && ` (${neighbor.variantName})`}
                        </Link>
                        <div className="flex items-center gap-2 sm:justify-end">
                          {edge.conditions && (
                            <span className="max-w-[20rem] text-xs text-muted-foreground">
                              {edge.conditions}
                            </span>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-xs ${LEVEL_COLORS[edge.level]}`}
                          >
                            {LEVEL_LABELS[edge.level]?.[0]}
                          </Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-6 py-5 text-sm text-muted-foreground">
                  No follow data available.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
