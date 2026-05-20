"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { StatusBadge } from "./status-badge";
import { MapPin } from "lucide-react";

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
      <Card className="atelier-link-card h-full cursor-pointer">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="font-heading text-xl font-medium leading-tight">
              {competition.name}
            </CardTitle>
            <StatusBadge status={competition.status} />
          </div>
          {orgName && (
            <p className="text-sm text-muted-foreground">{orgName}</p>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
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
