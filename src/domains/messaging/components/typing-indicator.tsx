"use client";

import type { Id } from "../../../../convex/_generated/dataModel";

interface TypingIndicatorProps {
  typingUsers: Id<"users">[];
  userNames: Map<Id<"users">, string>;
}

export function TypingIndicator({ typingUsers, userNames }: TypingIndicatorProps) {
  if (typingUsers.length === 0) return null;

  const names = typingUsers.map((id) => userNames.get(id) ?? "Someone");
  let text: string;

  if (names.length === 1) {
    text = `${names[0]} is typing...`;
  } else if (names.length === 2) {
    text = `${names[0]} and ${names[1]} are typing...`;
  } else {
    text = `${names[0]} and ${names.length - 1} others are typing...`;
  }

  return (
    <div className="px-4 py-1 text-xs text-muted-foreground animate-pulse">
      {text}
    </div>
  );
}
