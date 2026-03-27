"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { PostCard } from "@/domains/social/components/post-card";

export default function SavedPostsPage() {
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
  const { data: foldersData } = trpc.save.folders.useQuery();
  const { data: savedPosts } = trpc.save.postsInFolder.useQuery({
    folderId: activeFolderId,
  });

  const utils = trpc.useUtils();
  const deleteFolderMutation = trpc.save.deleteFolder.useMutation({
    onSuccess: () => {
      utils.save.folders.invalidate();
      setActiveFolderId(null);
    },
  });

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Saved Posts</h1>

      <div className="flex gap-6">
        {/* Folder sidebar */}
        <div className="w-48 shrink-0 space-y-1">
          <button
            className={`w-full text-left px-3 py-2 rounded text-sm ${
              activeFolderId === null ? "bg-muted font-medium" : "hover:bg-muted/50"
            }`}
            onClick={() => setActiveFolderId(null)}
          >
            All Saved ({foldersData?.allSavedCount ?? 0})
          </button>

          {foldersData?.folders.map((folder) => (
            <div key={folder.id} className="flex items-center group">
              <button
                className={`flex-1 text-left px-3 py-2 rounded text-sm ${
                  activeFolderId === folder.id ? "bg-muted font-medium" : "hover:bg-muted/50"
                }`}
                onClick={() => setActiveFolderId(folder.id)}
              >
                {folder.name} ({folder.postCount})
              </button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                onClick={() => deleteFolderMutation.mutate({ folderId: folder.id })}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>

        {/* Post list */}
        <div className="flex-1 space-y-4">
          {savedPosts && savedPosts.length > 0 ? (
            savedPosts.map((saved) => (
              <PostCard
                key={saved.savedPostId}
                post={{
                  id: saved.postId,
                  type: saved.type as "routine_share" | "article",
                  title: saved.title,
                  body: saved.body,
                  publishedAt: saved.publishedAt,
                  authorUsername: saved.authorUsername,
                  authorDisplayName: saved.authorDisplayName,
                  authorAvatarUrl: saved.authorAvatarUrl,
                }}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No saved posts in this folder.</p>
          )}
        </div>
      </div>
    </div>
  );
}
