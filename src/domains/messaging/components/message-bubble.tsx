"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { cn } from "@shared/lib/utils";
import type { Id } from "../../../../convex/_generated/dataModel";

interface MessageBubbleProps {
  message: {
    body: string;
    createdAt: number;
  };
  sender: {
    id: Id<"users">;
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
  };
  isOwnMessage: boolean;
}

export function MessageBubble({ message, sender, isOwnMessage }: MessageBubbleProps) {
  return (
    <div
      className={cn("flex gap-2 max-w-[80%]", isOwnMessage ? "ml-auto flex-row-reverse" : "")}
    >
      {!isOwnMessage && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={sender.avatarUrl ?? undefined} />
          <AvatarFallback>
            {(sender.displayName ?? sender.username ?? "?")?.[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}
      <div>
        {!isOwnMessage && (
          <p className="text-xs text-muted-foreground mb-1">
            {sender.displayName ?? sender.username}
          </p>
        )}
        <div
          className={cn(
            "rounded-[2px] border px-4 py-2 text-sm",
            isOwnMessage
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-card-foreground"
          )}
        >
          {message.body}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {new Date(message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}
