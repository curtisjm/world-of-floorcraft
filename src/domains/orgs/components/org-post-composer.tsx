"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { TiptapEditor } from "@social/components/editor/tiptap-editor";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface OrgPostComposerProps {
  orgId: Id<"organizations">;
}

export function OrgPostComposer({ orgId }: OrgPostComposerProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<
    "public" | "followers" | "organization"
  >("public");
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);

  const createOrgPost = useMutation(api.social.posts.createOrgPost);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full rounded-[2px] border border-dashed border-muted-foreground/30 px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-muted-foreground/60 hover:bg-muted/50"
      >
        Write a post for this organization...
      </button>
    );
  }

  const submit = async (publish: boolean) => {
    setPending(true);
    try {
      await createOrgPost({
        orgId,
        type: "article",
        title: title || undefined,
        body: body || undefined,
        visibility,
        publish,
      });
      setTitle("");
      setBody("");
      setVisibility("public");
      setExpanded(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4 border bg-card p-4">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Post title"
        className="text-lg font-semibold border-none px-0 focus-visible:ring-0"
      />

      <TiptapEditor
        content={body}
        onChange={setBody}
        placeholder="Write something..."
      />

      <div className="flex items-center gap-3">
        <select
          className="rounded-[2px] border border-input bg-input-surface px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as typeof visibility)}
        >
          <option value="public">Public</option>
          <option value="followers">Followers only</option>
          <option value="organization">Organization only</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void submit(false).catch(() => setPending(false))}
            disabled={pending}
          >
            Save Draft
          </Button>
          <Button
            size="sm"
            onClick={() => void submit(true).catch(() => setPending(false))}
            disabled={pending || !title}
          >
            Publish
          </Button>
        </div>
      </div>
    </div>
  );
}
