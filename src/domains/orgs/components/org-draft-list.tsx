"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Button } from "@shared/ui/button";
import { Card, CardContent } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Input } from "@shared/ui/input";
import { TiptapEditor } from "@social/components/editor/tiptap-editor";
import { Pencil, Trash2 } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface OrgDraftListProps {
  orgId: Id<"organizations">;
}

export function OrgDraftList({ orgId }: OrgDraftListProps) {
  const drafts = useQuery(api.social.posts.listOrgDrafts, { orgId });

  const [editingId, setEditingId] = useState<Id<"posts"> | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editVisibility, setEditVisibility] = useState<
    "public" | "followers" | "organization"
  >("public");
  const [pending, setPending] = useState(false);

  const publishOrgPost = useMutation(api.social.posts.publishOrgPost);
  const updateOrgPost = useMutation(api.social.posts.updateOrgPost);
  const removeOrgPost = useMutation(api.social.posts.removeOrgPost);

  if (drafts === undefined) {
    return <p className="text-muted-foreground text-sm">Loading drafts...</p>;
  }

  if (drafts.length === 0) return null;

  const startEditing = (draft: (typeof drafts)[number]) => {
    setEditingId(draft._id);
    setEditTitle(draft.title ?? "");
    setEditBody(draft.body ?? "");
    setEditVisibility(draft.visibility);
  };

  const handleSave = async () => {
    if (editingId === null) return;
    setPending(true);
    try {
      await updateOrgPost({
        postId: editingId,
        orgId,
        title: editTitle || undefined,
        body: editBody || undefined,
        visibility: editVisibility,
      });
      setEditingId(null);
    } finally {
      setPending(false);
    }
  };

  const handleSaveAndPublish = async (draftId: Id<"posts">) => {
    setPending(true);
    try {
      if (editingId !== null) {
        await updateOrgPost({
          postId: editingId,
          orgId,
          title: editTitle || undefined,
          body: editBody || undefined,
          visibility: editVisibility,
        });
      }
      await publishOrgPost({ postId: draftId, orgId });
      setEditingId(null);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">Drafts</h3>
      {drafts.map((draft) =>
        editingId === draft._id ? (
          <Card key={draft._id}>
            <CardContent className="p-4 space-y-3">
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Post title"
                className="text-lg font-semibold border-none px-0 focus-visible:ring-0"
              />
              <TiptapEditor
                content={editBody}
                onChange={setEditBody}
                placeholder="Write something..."
              />
              <div className="flex items-center gap-3">
                <select
                  className="rounded-[2px] border border-input bg-input-surface px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35"
                  value={editVisibility}
                  onChange={(e) =>
                    setEditVisibility(e.target.value as typeof editVisibility)
                  }
                >
                  <option value="public">Public</option>
                  <option value="followers">Followers only</option>
                  <option value="organization">Organization only</option>
                </select>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(null)}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleSave().catch(() => setPending(false))}
                    disabled={pending}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      void handleSaveAndPublish(draft._id).catch(() =>
                        setPending(false),
                      )
                    }
                    disabled={pending || !editTitle}
                  >
                    Publish
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card key={draft._id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {draft.title ? (
                      <p className="font-semibold">{draft.title}</p>
                    ) : (
                      <p className="text-muted-foreground italic">Untitled</p>
                    )}
                    <Badge variant="outline" className="text-xs">
                      Draft
                    </Badge>
                  </div>
                  {draft.body && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {draft.body.replace(/<[^>]*>/g, "").slice(0, 150)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Updated {new Date(draft.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => startEditing(draft)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void publishOrgPost({ postId: draft._id, orgId }).catch(
                        () => {},
                      )
                    }
                    disabled={!draft.title}
                  >
                    Publish
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() =>
                      void removeOrgPost({ postId: draft._id, orgId }).catch(
                        () => {},
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ),
      )}
    </div>
  );
}
