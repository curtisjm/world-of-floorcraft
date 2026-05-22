"use client";

import { usePathname } from "next/navigation";
import { ConversationSidebar } from "./conversation-sidebar";

interface MessagingLayoutProps {
  children: React.ReactNode;
}

export function MessagingLayout({ children }: MessagingLayoutProps) {
  const pathname = usePathname();
  const hasActiveConversation = pathname !== "/messages";

  return (
    <div className="atelier-shell flex h-[calc(100vh-4rem)] py-6">
      {/* Sidebar: full-screen on mobile when no conversation, always visible on desktop */}
      <div
        className={`${
          hasActiveConversation ? "hidden" : "flex"
        } md:flex w-full md:w-80 flex-col border border-border bg-card`}
      >
        <ConversationSidebar />
      </div>
      {/* Chat area: full-screen on mobile when conversation active, always visible on desktop */}
      <div
        className={`${
          hasActiveConversation ? "flex" : "hidden"
        } md:flex flex-1 flex-col border-y border-r border-border bg-card`}
      >
        {children}
      </div>
    </div>
  );
}
