"use client";

import { useState } from "react";
import { Bookmark, Plus } from "lucide-react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { trpc } from "@shared/lib/trpc";

interface SaveButtonProps {
  postId: number;
}

export function SaveButton({ postId }: SaveButtonProps) {
  const [open, setOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const utils = trpc.useUtils();

  const { data: folders } = trpc.save.folders.useQuery();
  const { data: postFolderIds } = trpc.save.postFolders.useQuery({ postId });

  const saveMutation = trpc.save.savePost.useMutation({
    onSuccess: () => {
      utils.save.postFolders.invalidate({ postId });
      utils.save.folders.invalidate();
    },
  });

  const unsaveMutation = trpc.save.unsavePost.useMutation({
    onSuccess: () => {
      utils.save.postFolders.invalidate({ postId });
      utils.save.folders.invalidate();
    },
  });

  const createFolderMutation = trpc.save.createFolder.useMutation({
    onSuccess: (folder) => {
      utils.save.folders.invalidate();
      saveMutation.mutate({ postId, folderId: folder.id });
      setNewFolderName("");
    },
  });

  const isSaved = postFolderIds && postFolderIds.length > 0;
  const folderIdSet = new Set(postFolderIds ?? []);

  const toggleFolder = (folderId: number | null) => {
    if (folderIdSet.has(folderId)) {
      unsaveMutation.mutate({ postId, folderId });
    } else {
      saveMutation.mutate({ postId, folderId });
    }
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
      >
        <Bookmark
          className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`}
        />
      </Button>

      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-56 rounded-[2px] border border-border bg-popover/95 p-2 shadow-none backdrop-blur-md">
          <label className="flex cursor-pointer items-center gap-2 rounded-[2px] px-2 py-1 text-sm hover:bg-muted">
            <input
              type="checkbox"
              checked={folderIdSet.has(null)}
              onChange={() => toggleFolder(null)}
            />
            All Saved
          </label>

          {folders?.folders.map((folder) => (
            <label
              key={folder.id}
              className="flex cursor-pointer items-center gap-2 rounded-[2px] px-2 py-1 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={folderIdSet.has(folder.id)}
                onChange={() => toggleFolder(folder.id)}
              />
              {folder.name}
            </label>
          ))}

          <div className="flex gap-1 mt-2 pt-2 border-t border-border">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New folder"
              className="h-7 text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 shrink-0"
              onClick={() => {
                if (newFolderName.trim()) {
                  createFolderMutation.mutate({ name: newFolderName.trim() });
                }
              }}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
