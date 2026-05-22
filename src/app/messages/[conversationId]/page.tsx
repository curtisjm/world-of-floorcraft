"use client";

import { useParams } from "next/navigation";
import { ChatArea } from "@messaging/components/chat-area";
import type { Id } from "../../../../convex/_generated/dataModel";

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  if (!conversationId) return <div className="p-6">Invalid conversation</div>;

  return <ChatArea conversationId={conversationId as Id<"conversations">} />;
}
