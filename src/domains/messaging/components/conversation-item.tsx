"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Badge } from "@shared/ui/badge";
import { cn } from "@shared/lib/utils";

interface ConversationItemProps {
  conversation: {
    id: number;
    type: string;
    name: string | null;
  };
  otherUser: {
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
  } | null;
  lastMessage: {
    body: string;
    createdAt: Date;
    senderId: string;
  } | null;
  unreadCount: number;
  isActive: boolean;
}

export function ConversationItem({
  conversation,
  otherUser,
  lastMessage,
  unreadCount,
  isActive,
}: ConversationItemProps) {
  const displayName =
    conversation.type === "direct"
      ? otherUser?.displayName ?? otherUser?.username ?? "Unknown"
      : conversation.name ?? "Group";

  const avatar = conversation.type === "direct" ? otherUser?.avatarUrl : null;

  return (
    <Link
      href={`/messages/${conversation.id}`}
      className={cn(
        "flex items-center gap-3 p-3 hover:bg-accent/50 transition-colors rounded-lg",
        isActive && "bg-accent"
      )}
    >
      <Avatar className="h-10 w-10">
        <AvatarImage src={avatar ?? undefined} />
        <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="font-medium truncate text-sm">{displayName}</p>
          {lastMessage && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {new Date(lastMessage.createdAt).toLocaleDateString()}
            </span>
          )}
        </div>
        {lastMessage && (
          <p className="text-xs text-muted-foreground truncate">
            {lastMessage.body}
          </p>
        )}
      </div>
      {unreadCount > 0 && (
        <Badge variant="destructive" className="rounded-full h-5 w-5 p-0 flex items-center justify-center text-xs">
          {unreadCount > 99 ? "99+" : unreadCount}
        </Badge>
      )}
    </Link>
  );
}
