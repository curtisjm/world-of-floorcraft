"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { StatusBadge } from "./status-badge";
import { MapPin, Calendar } from "lucide-react";

interface CompetitionCardProps {
  competition: {
    id: number;
    slug: string;
    name: string;
    status: string;
    description?: string | null;
    venueName?: string | null;
    city?: string | null;
    state?: string | null;
  };
  orgName?: string;
}

export function CompetitionCard({ competition, orgName }: CompetitionCardProps) {
  const location = [competition.venueName, competition.city, competition.state]
    .filter(Boolean)
    .join(", ");

  return (
    <Link href={`/competitions/${competition.slug}`}>
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base font-semibold leading-tight">
              {competition.name}
            </CardTitle>
            <StatusBadge status={competition.status} />
          </div>
          {orgName && (
            <p className="text-sm text-muted-foreground">{orgName}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-1.5">
          {competition.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {competition.description}
            </p>
          )}
          {location && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{location}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
