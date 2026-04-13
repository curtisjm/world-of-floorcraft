"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { trpc } from "@shared/lib/trpc";
import { TiptapEditor } from "./editor/tiptap-editor";

interface ArticleEditorProps {
  existingPost?: {
    id: number;
    title: string | null;
    body: string | null;
    visibility: "public" | "followers" | "organization";
    visibilityOrgId: number | null;
    publishedAt: Date | null;
  };
}

export function ArticleEditor({ existingPost }: ArticleEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(existingPost?.title ?? "");
  const [body, setBody] = useState(existingPost?.body ?? "");
  const [visibility, setVisibility] = useState<"public" | "followers" | "organization">(
    existingPost?.visibility ?? "public"
  );
  const [visibilityOrgId, setVisibilityOrgId] = useState<number | null>(
    existingPost?.visibilityOrgId ?? null
  );

  const { data: userOrgs } = trpc.org.listUserOrgs.useQuery(undefined, {
    enabled: visibility === "organization",
  });

  const createMutation = trpc.post.createArticle.useMutation({
    onSuccess: (post) => {
      router.push(`/posts/${post.id}`);
    },
  });

  const updateMutation = trpc.post.update.useMutation();

  // Guard: prevent autosave from firing during publish
  const isPublishingRef = useRef(false);

  // Auto-save for existing drafts (debounced)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const autoSave = useCallback(() => {
    if (!existingPost || isPublishingRef.current) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (isPublishingRef.current) return;
      updateMutation.mutate({
        id: existingPost.id,
        title: title || undefined,
        body: body || undefined,
        visibility,
        visibilityOrgId: visibility === "organization" ? visibilityOrgId : null,
      });
    }, 2000);
  }, [existingPost, title, body, visibility, visibilityOrgId, updateMutation]);

  useEffect(() => {
    autoSave();
    return () => clearTimeout(saveTimeoutRef.current);
  }, [title, body, visibility, autoSave]);

  const handleSaveDraft = () => {
    if (existingPost) {
      updateMutation.mutate({
        id: existingPost.id,
        title: title || undefined,
        body: body || undefined,
        visibility,
        visibilityOrgId: visibility === "organization" ? visibilityOrgId : null,
      });
    } else {
      createMutation.mutate({
        title,
        body,
        visibility,
        visibilityOrgId: visibility === "organization" ? visibilityOrgId ?? undefined : undefined,
        publish: false,
      });
    }
  };

  const handlePublish = async () => {
    if (existingPost) {
      isPublishingRef.current = true;
      clearTimeout(saveTimeoutRef.current);
      const post = await updateMutation.mutateAsync({
        id: existingPost.id,
        title: title || undefined,
        body: body || undefined,
        visibility,
        visibilityOrgId: visibility === "organization" ? visibilityOrgId : null,
        publish: true,
      });
      if (post) router.push(`/posts/${post.id}`);
    } else {
      createMutation.mutate({
        title,
        body,
        visibility,
        visibilityOrgId: visibility === "organization" ? visibilityOrgId ?? undefined : undefined,
        publish: true,
      });
    }
  };

  const isPending =
    createMutation.isPending || updateMutation.isPending;
  const isPublished = !!existingPost?.publishedAt;

  return (
    <div className="space-y-6">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Article title"
        className="text-xl font-bold border-none px-0 focus-visible:ring-0"
      />

      <TiptapEditor
        content={body}
        onChange={setBody}
        placeholder="Start writing your article..."
      />

      <div className="flex items-center gap-4">
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={visibility}
          onChange={(e) => {
            const v = e.target.value as typeof visibility;
            setVisibility(v);
            if (v !== "organization") setVisibilityOrgId(null);
          }}
        >
          <option value="public">Public</option>
          <option value="followers">Followers only</option>
          <option value="organization">Organization only</option>
        </select>

        {visibility === "organization" && userOrgs && userOrgs.length > 0 && (
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={visibilityOrgId ?? ""}
            onChange={(e) => setVisibilityOrgId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Select organization</option>
            {userOrgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        )}

        {!isPublished && (
          <Button variant="outline" onClick={handleSaveDraft} disabled={isPending}>
            Save Draft
          </Button>
        )}

        <Button onClick={handlePublish} disabled={isPending || !title}>
          {isPublished ? "Update" : "Publish"}
        </Button>
      </div>
    </div>
  );
}
