"use client";

import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Send } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface MessageInputProps {
  conversationId: Id<"conversations">;
  onTyping?: () => void;
  onBlur?: () => void;
  onSend?: () => void;
}

export function MessageInput({ conversationId, onTyping, onBlur, onSend }: MessageInputProps) {
  const [text, setText] = useState("");
  const [isPending, setIsPending] = useState(false);
  const send = useMutation(api.messaging.send);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = text.trim();
      if (!trimmed || isPending) return;
      setIsPending(true);
      try {
        await send({ conversationId, body: trimmed });
        setText("");
        onSend?.();
      } finally {
        setIsPending(false);
      }
    },
    [text, conversationId, send, onSend, isPending]
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
        disabled={!text.trim() || isPending}
      >
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}
