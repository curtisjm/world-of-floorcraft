import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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

// Placeholder data - will be replaced with tRPC queries
const PLACEHOLDER_FIGURES = [
  { id: 1, name: "Closed Change (RF)", level: "student_teacher", figureNumber: 1 },
  { id: 2, name: "Closed Change (LF)", level: "student_teacher", figureNumber: 2 },
  { id: 3, name: "Natural Turn", level: "student_teacher", figureNumber: 3 },
  { id: 4, name: "Reverse Turn", level: "student_teacher", figureNumber: 4 },
  { id: 5, name: "Whisk", level: "associate", figureNumber: 5 },
  { id: 6, name: "Chassé from PP", level: "associate", figureNumber: 6 },
];

export default async function DancePage({
  params,
}: {
  params: Promise<{ dance: string }>;
}) {
  const { dance } = await params;
  const displayName = dance
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {displayName}
            </h1>
            <p className="text-muted-foreground mt-2">
              Figures and transitions for the {displayName}
            </p>
          </div>
          <Button asChild variant="outline">
            <a href={`/dances/${dance}/graph`}>View Graph</a>
          </Button>
        </div>

        <Separator />

        <div className="space-y-3">
          {PLACEHOLDER_FIGURES.map((figure) => (
            <a
              key={figure.id}
              href={`/dances/${dance}/figures/${figure.id}`}
              className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-muted-foreground/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground text-sm font-mono w-6">
                  {figure.figureNumber}
                </span>
                <span className="font-medium">{figure.name}</span>
              </div>
              <Badge
                variant="outline"
                className={LEVEL_COLORS[figure.level]}
              >
                {LEVEL_LABELS[figure.level]}
              </Badge>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
