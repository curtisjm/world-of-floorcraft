import Link from "next/link";
import { Feed } from "@/domains/social/components/feed";
import { Button } from "@shared/ui/button";

export default function FeedPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Feed</h1>
        <Button asChild>
          <Link href="/posts/new">New Post</Link>
        </Button>
      </div>
      <Feed />
    </div>
  );
}
