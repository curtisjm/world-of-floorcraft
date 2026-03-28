"use client";

import { useParams } from "next/navigation";
import { ChatArea } from "@messaging/components/chat-area";

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const id = Number(conversationId);

  if (isNaN(id)) return <div className="p-6">Invalid conversation</div>;

  return <ChatArea conversationId={id} />;
}
