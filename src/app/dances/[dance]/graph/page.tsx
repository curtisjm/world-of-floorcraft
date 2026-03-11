import { Button } from "@/components/ui/button";

export default async function DanceGraphPage({
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
              {displayName} — Graph View
            </h1>
            <p className="text-muted-foreground mt-2">
              Interactive graph of all figure transitions
            </p>
          </div>
          <Button asChild variant="outline">
            <a href={`/dances/${dance}`}>Back to List</a>
          </Button>
        </div>

        <div className="flex items-center justify-center h-[600px] rounded-lg border border-dashed border-border">
          <p className="text-muted-foreground">
            React Flow graph will be rendered here
          </p>
        </div>
      </div>
    </div>
  );
}
