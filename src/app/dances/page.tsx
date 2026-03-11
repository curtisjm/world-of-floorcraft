import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const DANCES = [
  {
    slug: "waltz",
    name: "Waltz",
    timeSignature: "3/4",
    description: "The classic rise-and-fall dance in triple time",
  },
  {
    slug: "foxtrot",
    name: "Foxtrot",
    timeSignature: "4/4",
    description: "Smooth, progressive movement across the floor",
  },
  {
    slug: "quickstep",
    name: "Quickstep",
    timeSignature: "4/4",
    description: "Light, fast-moving dance with hops and runs",
  },
  {
    slug: "tango",
    name: "Tango",
    timeSignature: "2/4",
    description: "Sharp, staccato movements with dramatic character",
  },
  {
    slug: "viennese-waltz",
    name: "Viennese Waltz",
    timeSignature: "3/4",
    description: "Fast, rotating waltz with continuous turning",
  },
];

export default function DancesPage() {
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
          {DANCES.map((dance) => (
            <a key={dance.slug} href={`/dances/${dance.slug}`}>
              <Card className="hover:border-muted-foreground/50 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">{dance.name}</CardTitle>
                    <Badge variant="secondary">{dance.timeSignature}</Badge>
                  </div>
                  <CardDescription>{dance.description}</CardDescription>
                </CardHeader>
              </Card>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
