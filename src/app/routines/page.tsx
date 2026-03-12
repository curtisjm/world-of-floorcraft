import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function RoutinesPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Routines</h1>
            <p className="text-muted-foreground mt-2">
              Build and manage your dance routines.
            </p>
          </div>
          <Button asChild>
            <Link href="/routines/new">New Routine</Link>
          </Button>
        </div>

        <div className="flex items-center justify-center h-64 rounded-lg border border-dashed border-border">
          <div className="text-center space-y-2">
            <p className="text-muted-foreground">No routines yet.</p>
            <p className="text-sm text-muted-foreground">
              Sign in and create your first routine to get started.
            </p>
          </div>
        </div>

        {/* Example of what a routine card would look like */}
        <div className="hidden">
          <Card>
            <CardHeader>
              <CardTitle>Competition Waltz</CardTitle>
              <CardDescription>
                Waltz routine for associate-level competition
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );
}
