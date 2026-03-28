import { MessagingLayout } from "@messaging/components/messaging-layout";

export default function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MessagingLayout>{children}</MessagingLayout>;
}
