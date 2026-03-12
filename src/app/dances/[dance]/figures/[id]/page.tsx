import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, or } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { getDb } from "@/db";
import { dances, figures, figureEdges } from "@/db/schema";

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
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-2 pr-4 text-muted-foreground font-medium">#</th>
            <th className="py-2 pr-4 text-muted-foreground font-medium">
              Position
            </th>
            <th className="py-2 pr-4 text-muted-foreground font-medium">
              Alignment
            </th>
            <th className="py-2 pr-4 text-muted-foreground font-medium">
              Turn
            </th>
            <th className="py-2 text-muted-foreground font-medium">
              Rise & Fall
            </th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr key={step.step_number} className="border-b border-border/50">
              <td className="py-2 pr-4 font-mono text-muted-foreground">
                {step.step_number}
              </td>
              <td className="py-2 pr-4">{step.feet_position}</td>
              <td className="py-2 pr-4">{step.alignment}</td>
              <td className="py-2 pr-4">{step.amount_of_turn ?? "—"}</td>
              <td className="py-2">{step.rise_and_fall ?? "—"}</td>
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
    <div className="grid grid-cols-3 gap-4 text-sm">
      <div>
        <span className="font-medium text-foreground">Footwork:</span>{" "}
        <span className="text-muted-foreground">{footwork ?? "—"}</span>
      </div>
      <div>
        <span className="font-medium text-foreground">CBM:</span>{" "}
        <span className="text-muted-foreground">{cbm ?? "—"}</span>
      </div>
      <div>
        <span className="font-medium text-foreground">Sway:</span>{" "}
        <span className="text-muted-foreground">{sway ?? "—"}</span>
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

  const [figure] = await db
    .select()
    .from(figures)
    .where(eq(figures.id, figureId));

  if (!figure) notFound();

  const [dance] = await db
    .select()
    .from(dances)
    .where(eq(dances.id, figure.danceId));

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

  const manSteps = figure.manSteps as Step[] | null;
  const ladySteps = figure.ladySteps as Step[] | null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge
                variant="outline"
                className={LEVEL_COLORS[figure.level]}
              >
                {LEVEL_LABELS[figure.level]}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {dance?.displayName}
                {figure.figureNumber != null && ` — Figure #${figure.figureNumber}`}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              {figure.name}
              {figure.variantName && (
                <span className="text-muted-foreground font-normal text-2xl ml-3">
                  ({figure.variantName})
                </span>
              )}
            </h1>
            {figure.timing && (
              <p className="text-muted-foreground mt-1">
                Timing: {figure.timing}
                {figure.beatValue && ` — Beat value: ${figure.beatValue}`}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={`/dances/${danceSlug}/figures/${figureId}/graph`}>
                Local Graph
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/dances/${danceSlug}`}>Back to {dance?.displayName}</Link>
            </Button>
          </div>
        </div>

        <Separator />

        {/* Step charts */}
        {(manSteps || ladySteps) && (
          <Tabs defaultValue="man">
            <TabsList>
              <TabsTrigger value="man">Man&apos;s Steps</TabsTrigger>
              <TabsTrigger value="lady">Lady&apos;s Steps</TabsTrigger>
            </TabsList>

            <TabsContent value="man" className="mt-6 space-y-4">
              {manSteps && manSteps.length > 0 ? (
                <>
                  <StepTable steps={manSteps} />
                  <TechDetails
                    footwork={figure.manFootwork}
                    cbm={figure.manCbm}
                    sway={figure.manSway}
                  />
                </>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No step data available — see base figure.
                </p>
              )}
            </TabsContent>

            <TabsContent value="lady" className="mt-6 space-y-4">
              {ladySteps && ladySteps.length > 0 ? (
                <>
                  <StepTable steps={ladySteps} />
                  <TechDetails
                    footwork={figure.ladyFootwork}
                    cbm={figure.ladyCbm}
                    sway={figure.ladySway}
                  />
                </>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No step data available — see base figure.
                </p>
              )}
            </TabsContent>
          </Tabs>
        )}

        {/* Notes */}
        {figure.notes && (figure.notes as string[]).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {(figure.notes as string[]).map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Precede / Follow */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Preceded By ({precedeEdges.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {precedeEdges.length > 0 ? (
                <ul className="space-y-2">
                  {precedeEdges.map((edge) => {
                    const neighbor = neighborMap.get(edge.sourceFigureId);
                    return (
                      <li key={edge.id} className="flex items-center justify-between text-sm">
                        <Link
                          href={`/dances/${danceSlug}/figures/${edge.sourceFigureId}`}
                          className="hover:text-foreground text-muted-foreground transition-colors"
                        >
                          {neighbor?.name ?? `Figure #${edge.sourceFigureId}`}
                          {neighbor?.variantName && ` (${neighbor.variantName})`}
                        </Link>
                        <div className="flex items-center gap-2">
                          {edge.conditions && (
                            <span className="text-xs text-muted-foreground">
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
                <p className="text-muted-foreground text-sm">
                  No precede data available.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Followed By ({followEdges.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {followEdges.length > 0 ? (
                <ul className="space-y-2">
                  {followEdges.map((edge) => {
                    const neighbor = neighborMap.get(edge.targetFigureId);
                    return (
                      <li key={edge.id} className="flex items-center justify-between text-sm">
                        <Link
                          href={`/dances/${danceSlug}/figures/${edge.targetFigureId}`}
                          className="hover:text-foreground text-muted-foreground transition-colors"
                        >
                          {neighbor?.name ?? `Figure #${edge.targetFigureId}`}
                          {neighbor?.variantName && ` (${neighbor.variantName})`}
                        </Link>
                        <div className="flex items-center gap-2">
                          {edge.conditions && (
                            <span className="text-xs text-muted-foreground">
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
                <p className="text-muted-foreground text-sm">
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
