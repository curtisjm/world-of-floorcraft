"use client";

import { useState, useEffect, useRef } from "react";
import { trpc } from "@shared/lib/trpc";
import { Input } from "@shared/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { ScrollArea } from "@shared/ui/scroll-area";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";

interface SendInviteProps {
  orgId: number;
}

export function SendInvite({ orgId }: SendInviteProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sentUserIds, setSentUserIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchResults = trpc.profile.search.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 1 }
  );

  const sendMutation = trpc.invite.sendInvite.useMutation({
    onSuccess: (_data, variables) => {
      toast.success("Invite sent!");
      setSentUserIds((prev) => new Set(prev).add(variables.userId));
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleInvite = (userId: string) => {
    sendMutation.mutate({ orgId, userId });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Input
          ref={inputRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name or username..."
        />
        {searchResults.isFetching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {debouncedQuery.length >= 1 && (
        <div className="rounded-md border">
          {searchResults.isLoading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Searching...
            </div>
          ) : searchResults.data && searchResults.data.length > 0 ? (
            <ScrollArea className="max-h-48">
              <div className="p-1">
                {searchResults.data.map((user) => {
                  const alreadySent = sentUserIds.has(user.id);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleInvite(user.id)}
                      disabled={
                        alreadySent ||
                        (sendMutation.isPending &&
                          sendMutation.variables?.userId === user.id)
                      }
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-default"
                    >
                      <Avatar size="sm">
                        {user.avatarUrl && (
                          <AvatarImage src={user.avatarUrl} alt="" />
                        )}
                        <AvatarFallback>
                          {(user.displayName || user.username || "?")
                            .charAt(0)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {user.displayName || user.username}
                        </p>
                        {user.username && (
                          <p className="truncate text-xs text-muted-foreground">
                            @{user.username}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {alreadySent ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-500">
                            <Check className="h-3 w-3" />
                            Sent
                          </span>
                        ) : sendMutation.isPending &&
                          sendMutation.variables?.userId === user.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Invite
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No users found
            </p>
          )}
        </div>
      )}
    </div>
  );
}
