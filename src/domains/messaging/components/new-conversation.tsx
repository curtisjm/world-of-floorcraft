"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@shared/ui/dialog";

export function NewConversation() {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const router = useRouter();

  const dmMutation = trpc.conversation.getOrCreateDM.useMutation({
    onSuccess: (result) => {
      setOpen(false);
      setUsername("");
      router.push(`/messages/${result.id}`);
    },
  });

  const handleStartDM = () => {
    dmMutation.mutate({ otherUserId: username });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username or user ID"
          />
          <Button
            onClick={handleStartDM}
            disabled={!username.trim() || dmMutation.isPending}
            className="w-full"
          >
            Start Conversation
          </Button>
          {dmMutation.error && (
            <p className="text-destructive text-sm">{dmMutation.error.message}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
