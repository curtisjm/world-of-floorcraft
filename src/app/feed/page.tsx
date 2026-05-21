import Link from "next/link";
import { Feed } from "@/domains/social/components/feed";
import { Button } from "@shared/ui/button";
import { PenSquare } from "lucide-react";

export default function FeedPage() {
  return (
    <div className="atelier-shell">
      <div className="atelier-section mx-auto flex max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="atelier-eyebrow mb-4">community floor</p>
            <h1 className="atelier-page-title">Feed</h1>
          </div>
          <Button asChild>
            <Link href="/posts/new">
              <PenSquare data-icon="inline-start" />
              New post
            </Link>
          </Button>
        </div>
        <Feed />
      </div>
    </div>
  );
}
