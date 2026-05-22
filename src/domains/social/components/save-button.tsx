"use client";

import { useState } from "react";
import { Bookmark, Plus } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface SaveButtonProps {
  postId: Id<"posts">;
}

export function SaveButton({ postId }: SaveButtonProps) {
  const [open, setOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const folders = useQuery(api.social.saves.folders, {});
  const postFolderIds = useQuery(api.social.saves.postFolders, { postId });
  const savePost = useMutation(api.social.saves.savePost);
  const unsavePost = useMutation(api.social.saves.unsavePost);
  const createFolder = useMutation(api.social.saves.createFolder);

  const folderIdSet = new Set<Id<"saveFolders"> | null>(
    (postFolderIds ?? []) as Array<Id<"saveFolders"> | null>,
  );
  const isSaved = folderIdSet.size > 0;

  const toggleFolder = (folderId: Id<"saveFolders"> | null) => {
    if (folderIdSet.has(folderId)) {
      void unsavePost({ postId, folderId }).catch(() => {});
    } else {
      void savePost({ postId, folderId }).catch(() => {});
    }
  };

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    void (async () => {
      const folder = await createFolder({ name });
      await savePost({ postId, folderId: folder._id });
      setNewFolderName("");
    })().catch(() => {});
  };

  return (
    <div className="relative">
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
        <Bookmark className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`} />
      </Button>

      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-56 rounded-[2px] border border-border bg-popover p-2 shadow-none">
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
              onClick={handleCreateFolder}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
