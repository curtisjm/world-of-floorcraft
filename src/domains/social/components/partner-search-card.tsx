"use client";

import { Badge } from "@shared/ui/badge";

const STYLE_LABELS: Record<string, string> = {
  standard: "Standard",
  smooth: "Smooth",
  latin: "Latin",
  rhythm: "Rhythm",
  nightclub: "Nightclub",
};

const ROLE_LABELS: Record<string, string> = {
  lead: "Lead",
  follow: "Follow",
  both: "Lead or Follow",
};

interface PartnerSearchCardProps {
  profile: {
    danceStyles: string[];
    height: string | null;
    location: string | null;
    bio: string | null;
    rolePreference: string;
  };
}

export function PartnerSearchCard({ profile }: PartnerSearchCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">Looking for a Partner</span>
        <Badge variant="secondary" className="text-xs">
          {ROLE_LABELS[profile.rolePreference] ?? profile.rolePreference}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {profile.danceStyles.map((style) => (
          <Badge key={style} variant="outline" className="text-xs">
            {STYLE_LABELS[style] ?? style}
          </Badge>
        ))}
      </div>

      {(profile.height || profile.location) && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {profile.height && <span>{profile.height}</span>}
          {profile.height && profile.location && <span>·</span>}
          {profile.location && <span>{profile.location}</span>}
        </div>
      )}

      {profile.bio && (
        <p className="text-sm text-muted-foreground">{profile.bio}</p>
      )}
    </div>
  );
}
