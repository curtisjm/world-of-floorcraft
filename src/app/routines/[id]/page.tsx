import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function RoutineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Routine #{id}
            </h1>
            <p className="text-muted-foreground mt-2">
              View and edit your routine.
            </p>
          </div>
          <Button asChild variant="outline">
            <a href="/routines">Back to Routines</a>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Routine Figures</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-48 rounded-lg border border-dashed border-border">
              <p className="text-muted-foreground text-sm">
                Routine details will be loaded from the database.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
