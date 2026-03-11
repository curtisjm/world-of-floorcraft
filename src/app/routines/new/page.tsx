import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NewRoutinePage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Routine</h1>
          <p className="text-muted-foreground mt-2">
            Create a new dance routine by selecting figures in sequence.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Routine Details</CardTitle>
            <CardDescription>
              Give your routine a name and select a dance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="name">
                Name
              </label>
              <Input id="name" placeholder="e.g., Competition Waltz" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="dance">
                Dance
              </label>
              <Input
                id="dance"
                placeholder="Select a dance..."
                disabled
              />
              <p className="text-xs text-muted-foreground">
                Dance selector will be implemented with data from the database.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Figures</CardTitle>
            <CardDescription>
              Add figures to your routine in order.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-32 rounded-lg border border-dashed border-border">
              <p className="text-muted-foreground text-sm">
                Drag-and-drop routine builder coming soon.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button asChild variant="outline">
            <a href="/routines">Cancel</a>
          </Button>
          <Button disabled>Save Routine</Button>
        </div>
      </div>
    </div>
  );
}
