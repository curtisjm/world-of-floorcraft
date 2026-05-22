export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@shared/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { api } from "../../../../../../convex/_generated/api";

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
    <>
      <div className="space-y-3 md:hidden">
        {steps.map((step) => (
          <article
            key={step.step_number}
            data-adapted-step-card
            className="atelier-panel grid gap-4 p-4 text-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <span className="font-mono text-xs text-muted-foreground">
                step {step.step_number}
              </span>
              <span className="text-base font-medium text-foreground">
                {step.feet_position}
              </span>
            </div>
            <dl className="grid gap-3">
              <div>
                <dt className="font-mono text-xs lowercase text-muted-foreground">
                  alignment
                </dt>
                <dd className="mt-1 text-foreground">{step.alignment}</dd>
              </div>
              <div>
                <dt className="font-mono text-xs lowercase text-muted-foreground">
                  turn
                </dt>
                <dd className="mt-1 text-foreground">
                  {step.amount_of_turn ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-xs lowercase text-muted-foreground">
                  rise & fall
                </dt>
                <dd className="mt-1 text-foreground">
                  {step.rise_and_fall ?? "—"}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="atelier-panel hidden overflow-x-auto md:block">
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
    </>
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
  const { dance: danceSlug, id: figureId } = await params;

  const dance = await fetchQuery(api.syllabus.dances.getByName, {
    name: danceSlug,
  });
  if (!dance) notFound();

  const figure = await fetchQuery(api.syllabus.figures.getDetail, {
    figureId,
  });
  if (!figure || figure.danceId !== dance.id) notFound();

  const { precedes, follows } = await fetchQuery(
    api.syllabus.figures.neighbors,
    { figureId },
  );

  const leaderSteps = figure.leaderSteps as Step[] | null;
  const followerSteps = figure.followerSteps as Step[] | null;

  return (
    <div className="atelier-shell py-10 sm:py-14">
      <section className="border-b border-border pb-14">
        <div className="atelier-section-head">
          <span className="font-mono text-xs lowercase text-muted-foreground">
            fig.{figure.figureNumber ?? "—"}
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
                    {dance.displayName}
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
                  <Link href={`/dances/${danceSlug}/figures/${figure.id}/graph`}>
                    Local graph
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/dances/${danceSlug}`}>Back to {dance.displayName}</Link>
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
        {figure.notes && figure.notes.length > 0 && (
          <Card className="gap-0 py-0">
            <CardHeader className="border-b bg-secondary px-6 py-4">
              <CardTitle className="font-mono text-xs font-medium lowercase text-muted-foreground">
                notes
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 py-6">
              <ul className="space-y-4 text-[0.95rem] leading-relaxed text-muted-foreground">
                {figure.notes.map((note, i) => (
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
                preceded by ({precedes.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[36rem] overflow-y-auto px-0">
              {precedes.length > 0 ? (
                <ul className="divide-y divide-border">
                  {precedes.map((edge) => {
                    const neighbor = edge.figure;
                    return (
                      <li key={edge.id} className="grid gap-3 px-6 py-4 text-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                        <Link
                          href={`/dances/${danceSlug}/figures/${edge.sourceFigureId}`}
                          className="flex min-h-11 min-w-0 flex-col justify-center text-base font-medium leading-tight text-foreground transition-colors hover:text-muted-foreground"
                        >
                          <span className="block truncate">
                            {neighbor?.name ?? "Unknown figure"}
                          </span>
                          {neighbor?.variantName && (
                            <span className="mt-1 block truncate text-sm font-normal text-muted-foreground">
                              {neighbor.variantName}
                            </span>
                          )}
                        </Link>
                        <div className="flex min-w-0 items-center gap-2 lg:justify-end">
                          {edge.conditions && (
                            <span className="min-w-0 max-w-[20rem] text-xs leading-relaxed text-muted-foreground">
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
                followed by ({follows.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[36rem] overflow-y-auto px-0">
              {follows.length > 0 ? (
                <ul className="divide-y divide-border">
                  {follows.map((edge) => {
                    const neighbor = edge.figure;
                    return (
                      <li key={edge.id} className="grid gap-3 px-6 py-4 text-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                        <Link
                          href={`/dances/${danceSlug}/figures/${edge.targetFigureId}`}
                          className="flex min-h-11 min-w-0 flex-col justify-center text-base font-medium leading-tight text-foreground transition-colors hover:text-muted-foreground"
                        >
                          <span className="block truncate">
                            {neighbor?.name ?? "Unknown figure"}
                          </span>
                          {neighbor?.variantName && (
                            <span className="mt-1 block truncate text-sm font-normal text-muted-foreground">
                              {neighbor.variantName}
                            </span>
                          )}
                        </Link>
                        <div className="flex min-w-0 items-center gap-2 lg:justify-end">
                          {edge.conditions && (
                            <span className="min-w-0 max-w-[20rem] text-xs leading-relaxed text-muted-foreground">
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
