"use client";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Card, CardContent } from "@shared/ui/card";

interface OrgCardProps {
  org: {
    slug: string;
    name: string;
    description: string | null;
    avatarUrl: string | null;
    memberCount?: number;
  };
}

export function OrgCard({ org }: OrgCardProps) {
  return (
    <Link href={`/orgs/${org.slug}`}>
      <Card className="hover:bg-accent/50 transition-colors">
        <CardContent className="flex items-center gap-4 p-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src={org.avatarUrl ?? undefined} />
            <AvatarFallback>{org.name[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{org.name}</p>
            {org.description && (
              <p className="text-sm text-muted-foreground line-clamp-1">{org.description}</p>
            )}
            {org.memberCount !== undefined && (
              <p className="text-xs text-muted-foreground">
                {org.memberCount} {org.memberCount === 1 ? "member" : "members"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
