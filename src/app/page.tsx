import Link from "next/link";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { ArrowRight, Route, Trophy } from "lucide-react";

export default function HomePage() {
  return (
    <div className="atelier-shell">
      <section className="grid min-h-[calc(100vh-4.1rem)] items-center gap-12 border-b border-border py-12 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,30rem)] lg:py-20">
        <div className="flex max-w-4xl flex-col gap-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="metal-bronze-whisper metal-whisper" variant="outline">
              Bronze
            </Badge>
            <Badge className="metal-silver-whisper metal-whisper" variant="outline">
              Silver
            </Badge>
            <Badge className="metal-gold-whisper metal-whisper" variant="outline">
              Gold
            </Badge>
          </div>
          <div className="flex flex-col gap-5">
            <p className="atelier-eyebrow">standard syllabus studio</p>
            <h1 className="max-w-5xl text-6xl font-medium leading-[0.9] sm:text-7xl lg:text-8xl">
              World <span className="italic font-light">of</span> Floorcraft
            </h1>
          </div>
          <p className="max-w-2xl text-xl leading-9 text-muted-foreground">
            Explore the ISTD ballroom syllabus as a precise working graph. Browse
            figures, study transitions, compose routines, and follow competition
            results from the same quiet workspace.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/dances">
                Browse dances
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/routines">Build routines</Link>
            </Button>
          </div>
          <dl className="grid max-w-3xl grid-cols-2 border-y border-border sm:grid-cols-4">
            {[
              ["5", "dances"],
              ["3", "medal levels"],
              ["graph", "transitions"],
              ["live", "results"],
            ].map(([value, label]) => (
              <div key={label} className="border-border py-5 pr-4 sm:border-r sm:last:border-r-0">
                <dt className="font-heading text-2xl italic leading-none">{value}</dt>
                <dd className="font-mono text-xs lowercase text-muted-foreground">
                  {label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="atelier-panel atelier-rule-grid relative min-h-[31rem] overflow-hidden p-5">
          <div className="absolute inset-x-5 top-5 flex items-center justify-between border-b border-border pb-3">
            <span className="font-mono text-xs lowercase text-muted-foreground">
              routine plate
            </span>
            <Route className="size-4 text-muted-foreground" />
          </div>
          <div className="absolute inset-x-8 top-24 h-px bg-border" />
          <div className="absolute left-1/2 top-24 h-64 w-px bg-border" />
          <div className="absolute left-10 top-36 flex items-center gap-3">
            <span className="metal-bronze-brushed size-11 rounded-full border border-border metal-shine" />
            <span className="font-mono text-xs lowercase text-muted-foreground">
              natural turn
            </span>
          </div>
          <div className="absolute right-10 top-52 flex items-center gap-3">
            <span className="font-mono text-xs lowercase text-muted-foreground">
              feather finish
            </span>
            <span className="metal-silver-brushed size-12 rounded-full border border-border metal-shine" />
          </div>
          <div className="absolute bottom-20 left-16 flex items-center gap-3">
            <span className="metal-gold-brushed size-14 rounded-full border border-border metal-shine" />
            <span className="font-mono text-xs lowercase text-muted-foreground">
              hover corte
            </span>
          </div>
          <div className="absolute bottom-5 right-5 flex items-center gap-2 border border-border bg-card px-3 py-2">
            <Trophy className="size-4 text-muted-foreground" />
            <span className="font-mono text-xs lowercase">competition ready</span>
          </div>
        </div>
      </section>
    </div>
  );
}
