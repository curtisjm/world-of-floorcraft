"use client";

import { useState } from "react";
import { Button } from "@shared/ui/button";
import { Card, CardContent } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Input } from "@shared/ui/input";
import { trpc } from "@shared/lib/trpc";
import { TiptapEditor } from "@social/components/editor/tiptap-editor";
import { Pencil, Trash2 } from "lucide-react";

interface OrgDraftListProps {
  orgId: number;
}

export function OrgDraftList({ orgId }: OrgDraftListProps) {
  const utils = trpc.useUtils();
  const { data: drafts, isLoading } = trpc.orgPost.listDrafts.useQuery({ orgId });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editVisibility, setEditVisibility] = useState<
    "public" | "followers" | "organization"
  >("public");

  const publishMutation = trpc.orgPost.publish.useMutation({
    onSuccess: () => {
      utils.orgPost.listDrafts.invalidate({ orgId });
      utils.orgPost.listByOrg.invalidate({ orgId });
    },
  });

  const updateMutation = trpc.orgPost.update.useMutation({
    onSuccess: () => {
      setEditingId(null);
      utils.orgPost.listDrafts.invalidate({ orgId });
    },
  });

  const deleteMutation = trpc.orgPost.delete.useMutation({
    onSuccess: () => {
      utils.orgPost.listDrafts.invalidate({ orgId });
    },
  });

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading drafts...</p>;
  }

  if (!drafts || drafts.length === 0) {
    return null;
  }

  const startEditing = (draft: (typeof drafts)[number]) => {
    setEditingId(draft.id);
    setEditTitle(draft.title ?? "");
    setEditBody(draft.body ?? "");
    setEditVisibility(draft.visibility);
  };

  const handleSave = () => {
    if (editingId === null) return;
    updateMutation.mutate({
      id: editingId,
      orgId,
      title: editTitle || undefined,
      body: editBody || undefined,
      visibility: editVisibility,
    });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">Drafts</h3>
      {drafts.map((draft) =>
        editingId === draft.id ? (
          <Card key={draft.id}>
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
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                    disabled={updateMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      handleSave();
                      publishMutation.mutate({ id: draft.id, orgId });
                    }}
                    disabled={
                      updateMutation.isPending ||
                      publishMutation.isPending ||
                      !editTitle
                    }
                  >
                    Publish
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card key={draft.id}>
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
                    Updated{" "}
                    {new Date(draft.updatedAt).toLocaleDateString()}
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
                      publishMutation.mutate({ id: draft.id, orgId })
                    }
                    disabled={publishMutation.isPending || !draft.title}
                  >
                    Publish
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() =>
                      deleteMutation.mutate({ id: draft.id, orgId })
                    }
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
