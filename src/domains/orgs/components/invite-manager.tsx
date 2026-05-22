"use client";
import { useState } from "react";
import { useMutation } from "convex/react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { convexErrorMessage } from "@social/lib/convex-error";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface InviteManagerProps {
  orgId: Id<"organizations">;
}

export function InviteManager({ orgId }: InviteManagerProps) {
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useMutation(api.orgs.generateInviteLink);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const invite = await generate({ orgId });
      if (!invite?.token) {
        setError("Failed to generate invite link");
        return;
      }
      const link = `${window.location.origin}/orgs/invite/${invite.token}`;
      setInviteLink(link);
    } catch (err) {
      setError(convexErrorMessage(err, "Failed to generate invite link"));
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={handleGenerate} disabled={generating} className="w-fit">
        Generate Invite Link
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {inviteLink && (
        <div className="flex gap-2">
          <Input value={inviteLink} readOnly className="flex-1" />
          <Button variant="outline" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      )}
    </div>
  );
}
