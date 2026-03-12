import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-73px)] px-6">
      <div className="max-w-2xl text-center space-y-8">
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Badge
              className="border-bronze text-bronze"
              variant="outline"
            >
              Bronze
            </Badge>
            <Badge
              className="border-silver text-silver"
              variant="outline"
            >
              Silver
            </Badge>
            <Badge
              className="border-gold text-gold"
              variant="outline"
            >
              Gold
            </Badge>
          </div>
          <h1 className="text-5xl font-bold tracking-tight">Figure Graph</h1>
          <p className="text-xl text-muted-foreground">
            Explore the ISTD ballroom dance syllabus as an interactive graph.
            Browse figures, discover transitions, and build routines.
          </p>
        </div>
        <div className="flex items-center justify-center gap-4">
          <Button asChild size="lg">
            <Link href="/dances">Browse Dances</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/routines">My Routines</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
