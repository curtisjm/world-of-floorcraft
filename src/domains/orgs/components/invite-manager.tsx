"use client";
import { useState } from "react";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";

interface InviteManagerProps {
  orgId: number;
}

export function InviteManager({ orgId }: InviteManagerProps) {
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateMutation = trpc.invite.generateLink.useMutation({
    onSuccess: (data) => {
      const link = `${window.location.origin}/orgs/invite/${data.token}`;
      setInviteLink(link);
    },
  });

  const handleCopy = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Button
        onClick={() => generateMutation.mutate({ orgId })}
        disabled={generateMutation.isPending}
        className="w-fit"
      >
        Generate Invite Link
      </Button>
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
