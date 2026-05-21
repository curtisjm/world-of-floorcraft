"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { Button } from "@shared/ui/button";

interface ShareButtonProps {
  postId: number;
}

export function ShareButton({ postId }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const url = `${window.location.origin}/posts/${postId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy}>
      {copied ? (
        <Check className="h-4 w-4 text-sage" />
      ) : (
        <Share2 className="h-4 w-4" />
      )}
    </Button>
  );
}
