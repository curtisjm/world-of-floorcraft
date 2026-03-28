"use client";

import { ConversationSidebar } from "./conversation-sidebar";

interface MessagingLayoutProps {
  children: React.ReactNode;
}

export function MessagingLayout({ children }: MessagingLayoutProps) {
  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <ConversationSidebar />
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}
