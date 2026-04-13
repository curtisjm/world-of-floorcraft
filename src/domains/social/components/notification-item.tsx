"use client";

import Link from "next/link";
import {
  Heart,
  MessageCircle,
  Reply,
  UserPlus,
  UserCheck,
  Mail,
  Building2,
  Users,
  Bell,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@shared/ui/avatar";
import { cn } from "@shared/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationType =
  | "like"
  | "comment"
  | "reply"
  | "follow"
  | "follow_request"
  | "follow_accepted"
  | "message"
  | "org_invite"
  | "join_request"
  | "join_approved"
  | "org_post";

export interface NotificationActor {
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
}

export interface NotificationData {
  id: number;
  type: NotificationType;
  read: boolean;
  createdAt: Date | string;
  postId?: number | null;
  commentId?: number | null;
  orgId?: number | null;
  conversationId?: number | null;
}

interface NotificationItemProps {
  notification: NotificationData;
  actor: NotificationActor | null;
  onRead: (notificationId: number) => void;
}

// ── Relative time helper ──────────────────────────────────────────────────────

export function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Notification config ───────────────────────────────────────────────────────

type NotificationConfig = {
  icon: React.ElementType;
  iconClass: string;
  getMessage: (actorName: string) => string;
  getHref: (
    notification: NotificationData,
    actor: NotificationActor | null
  ) => string;
};

const NOTIFICATION_CONFIG: Record<NotificationType, NotificationConfig> = {
  like: {
    icon: Heart,
    iconClass: "text-rose-400",
    getMessage: (name) => `${name} liked your post`,
    getHref: (n) => `/posts/${n.postId}`,
  },
  comment: {
    icon: MessageCircle,
    iconClass: "text-blue-400",
    getMessage: (name) => `${name} commented on your post`,
    getHref: (n) => `/posts/${n.postId}`,
  },
  reply: {
    icon: Reply,
    iconClass: "text-sky-400",
    getMessage: (name) => `${name} replied to your comment`,
    getHref: (n) => `/posts/${n.postId}`,
  },
  follow: {
    icon: UserPlus,
    iconClass: "text-emerald-400",
    getMessage: (name) => `${name} started following you`,
    getHref: (_n, actor) =>
      actor?.username ? `/users/${actor.username}` : "/",
  },
  follow_request: {
    icon: UserPlus,
    iconClass: "text-amber-400",
    getMessage: (name) => `${name} requested to follow you`,
    getHref: () => "/settings/profile",
  },
  follow_accepted: {
    icon: UserCheck,
    iconClass: "text-emerald-400",
    getMessage: (name) => `${name} accepted your follow request`,
    getHref: (_n, actor) =>
      actor?.username ? `/users/${actor.username}` : "/",
  },
  message: {
    icon: Mail,
    iconClass: "text-violet-400",
    getMessage: (name) => `${name} sent you a message`,
    getHref: (n) => `/messages/${n.conversationId}`,
  },
  org_invite: {
    icon: Building2,
    iconClass: "text-indigo-400",
    getMessage: (name) => `${name} invited you to join an organization`,
    getHref: () => "/invites",
  },
  join_request: {
    icon: Users,
    iconClass: "text-orange-400",
    getMessage: (name) => `${name} requested to join your organization`,
    getHref: (n) => `/orgs/${n.orgId}`,
  },
  join_approved: {
    icon: UserCheck,
    iconClass: "text-emerald-400",
    getMessage: () => "You've been accepted into an organization",
    getHref: (n) => `/orgs/${n.orgId}`,
  },
  org_post: {
    icon: Bell,
    iconClass: "text-yellow-400",
    getMessage: () => "Your organization published a new post",
    getHref: (n) => `/posts/${n.postId}`,
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function NotificationItem({
  notification,
  actor,
  onRead,
}: NotificationItemProps) {
  const config = NOTIFICATION_CONFIG[notification.type];
  const Icon = config.icon;

  const actorName =
    actor?.displayName ?? actor?.username ?? "Someone";
  const message = config.getMessage(actorName);
  const href = config.getHref(notification, actor);
  const avatarFallback = actorName[0]?.toUpperCase() ?? "?";

  function handleClick() {
    if (!notification.read) {
      onRead(notification.id);
    }
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={cn(
        "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/30 relative",
        !notification.read && "bg-accent/20"
      )}
    >
      {/* Unread dot */}
      {!notification.read && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-blue-500 shrink-0" />
      )}

      {/* Avatar with icon badge */}
      <div className="relative shrink-0">
        <Avatar size="default">
          {actor?.avatarUrl && (
            <AvatarImage src={actor.avatarUrl} alt={actorName} />
          )}
          <AvatarFallback>{avatarFallback}</AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-background ring-1 ring-border",
            config.iconClass
          )}
        >
          <Icon className="size-2.5" />
        </span>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug text-foreground">{message}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>
    </Link>
  );
}
