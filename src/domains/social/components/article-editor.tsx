"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { TiptapEditor } from "./editor/tiptap-editor";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface ArticleEditorProps {
  existingPost?: {
    id: Id<"posts">;
    title: string | null;
    body: string | null;
    visibility: "public" | "followers" | "organization";
    visibilityOrgId: Id<"organizations"> | null;
    publishedAt: number | null;
  };
}

export function ArticleEditor({ existingPost }: ArticleEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(existingPost?.title ?? "");
  const [body, setBody] = useState(existingPost?.body ?? "");
  const [visibility, setVisibility] = useState<
    "public" | "followers" | "organization"
  >(existingPost?.visibility ?? "public");
  const [visibilityOrgId, setVisibilityOrgId] = useState<Id<"organizations"> | null>(
    existingPost?.visibilityOrgId ?? null,
  );
  const [isPending, setIsPending] = useState(false);

  const userOrgs = useQuery(
    api.orgs.listUserOrgs,
    visibility === "organization" ? {} : "skip",
  );

  const createArticle = useMutation(api.social.posts.createArticle);
  const updatePost = useMutation(api.social.posts.update);

  const isPublishingRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const autoSave = useCallback(() => {
    if (!existingPost || isPublishingRef.current) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (isPublishingRef.current) return;
      void updatePost({
        postId: existingPost.id,
        title: title || undefined,
        body: body || undefined,
        visibility,
        visibilityOrgId:
          visibility === "organization" ? visibilityOrgId : null,
      }).catch(() => {});
    }, 2000);
  }, [existingPost, title, body, visibility, visibilityOrgId, updatePost]);

  useEffect(() => {
    autoSave();
    return () => clearTimeout(saveTimeoutRef.current);
  }, [title, body, visibility, autoSave]);

  const handleSaveDraft = async () => {
    setIsPending(true);
    try {
      if (existingPost) {
        await updatePost({
          postId: existingPost.id,
          title: title || undefined,
          body: body || undefined,
          visibility,
          visibilityOrgId:
            visibility === "organization" ? visibilityOrgId : null,
        });
      } else {
        const post = await createArticle({
          title,
          body,
          visibility,
          visibilityOrgId:
            visibility === "organization"
              ? visibilityOrgId ?? undefined
              : undefined,
          publish: false,
        });
        router.push(`/posts/${post._id}`);
      }
    } finally {
      setIsPending(false);
    }
  };

  const handlePublish = async () => {
    setIsPending(true);
    try {
      if (existingPost) {
        isPublishingRef.current = true;
        clearTimeout(saveTimeoutRef.current);
        const post = await updatePost({
          postId: existingPost.id,
          title: title || undefined,
          body: body || undefined,
          visibility,
          visibilityOrgId:
            visibility === "organization" ? visibilityOrgId : null,
          publish: true,
        });
        if (post) router.push(`/posts/${post._id}`);
      } else {
        const post = await createArticle({
          title,
          body,
          visibility,
          visibilityOrgId:
            visibility === "organization"
              ? visibilityOrgId ?? undefined
              : undefined,
          publish: true,
        });
        router.push(`/posts/${post._id}`);
      }
    } finally {
      setIsPending(false);
    }
  };

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

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <select
          className="w-full rounded-[2px] border border-input bg-input-surface px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 sm:w-auto"
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
            className="w-full rounded-[2px] border border-input bg-input-surface px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 sm:w-auto"
            value={visibilityOrgId ?? ""}
            onChange={(e) =>
              setVisibilityOrgId(
                e.target.value
                  ? (e.target.value as Id<"organizations">)
                  : null,
              )
            }
          >
            <option value="">Select organization</option>
            {userOrgs.map((org) => (
              <option key={org._id} value={org._id}>
                {org.name}
              </option>
            ))}
          </select>
        )}

        <div className="flex gap-3 sm:gap-4">
          {!isPublished && (
            <Button
              variant="outline"
              onClick={() => void handleSaveDraft().catch(() => {})}
              disabled={isPending}
              className="flex-1 sm:flex-initial"
            >
              Save Draft
            </Button>
          )}

          <Button
            onClick={() => void handlePublish().catch(() => {})}
            disabled={isPending || !title}
            className="flex-1 sm:flex-initial"
          >
            {isPublished ? "Update" : "Publish"}
          </Button>
        </div>
      </div>
    </div>
  );
}
