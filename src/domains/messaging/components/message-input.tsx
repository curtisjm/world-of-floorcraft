"use client";

import { useState, useCallback } from "react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Send } from "lucide-react";
import { trpc } from "@shared/lib/trpc";

interface MessageInputProps {
  conversationId: number;
  onTyping?: () => void;
  onBlur?: () => void;
  onSend?: () => void;
}

export function MessageInput({ conversationId, onTyping, onBlur, onSend }: MessageInputProps) {
  const [text, setText] = useState("");
  const utils = trpc.useUtils();

  const sendMutation = trpc.message.send.useMutation({
    onSuccess: () => {
      setText("");
      utils.message.history.invalidate({ conversationId });
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = text.trim();
      if (!trimmed) return;
      sendMutation.mutate({ conversationId, body: trimmed });
      onSend?.();
    },
    [text, conversationId, sendMutation, onSend]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setText(e.target.value);
      onTyping?.();
    },
    [onTyping]
  );

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-t">
      <Input
        value={text}
        onChange={handleChange}
        onBlur={onBlur}
        placeholder="Type a message..."
        className="flex-1"
        autoComplete="off"
      />
      <Button
        type="submit"
        size="icon"
        disabled={!text.trim() || sendMutation.isPending}
      >
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}
