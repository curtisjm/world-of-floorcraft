"use client";
import Link from "next/link";
import { trpc } from "@shared/lib/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Badge } from "@shared/ui/badge";

interface MemberListProps {
  orgId: number;
}

export function MemberList({ orgId }: MemberListProps) {
  const { data, isLoading } = trpc.membership.listMembers.useQuery({ orgId });

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading members...</p>;
  }

  if (!data || data.length === 0) {
    return <p className="text-muted-foreground text-sm">No members yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {data.map((member) => (
        <Link
          key={member.userId}
          href={`/users/${member.username}`}
          className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors"
        >
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={member.avatarUrl ?? undefined} />
            <AvatarFallback>
              {(member.displayName ?? member.username ?? "?")[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{member.displayName ?? member.username}</p>
            {member.username && (
              <p className="text-sm text-muted-foreground truncate">@{member.username}</p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {member.isOwner && <Badge variant="default">Owner</Badge>}
            {!member.isOwner && member.role === "admin" && (
              <Badge variant="secondary">Admin</Badge>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
