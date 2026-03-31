"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Badge } from "@shared/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { ScrollArea } from "@shared/ui/scroll-area";
import { Plus, X, Loader2, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@shared/ui/dialog";

type UserResult = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export function NewConversation() {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<UserResult[]>([]);
  const [groupName, setGroupName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Debounce search query
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

  const dmMutation = trpc.conversation.getOrCreateDM.useMutation({
    onSuccess: (result) => {
      handleClose();
      router.push(`/messages/${result.id}`);
    },
  });

  const groupMutation = trpc.conversation.createGroup.useMutation({
    onSuccess: (result) => {
      handleClose();
      router.push(`/messages/${result.id}`);
    },
  });

  const handleClose = useCallback(() => {
    setOpen(false);
    setSearchQuery("");
    setDebouncedQuery("");
    setSelectedUsers([]);
    setGroupName("");
  }, []);

  const addUser = (user: UserResult) => {
    if (!selectedUsers.find((u) => u.id === user.id)) {
      setSelectedUsers((prev) => [...prev, user]);
    }
    setSearchQuery("");
    inputRef.current?.focus();
  };

  const removeUser = (userId: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  const handleStartConversation = () => {
    if (selectedUsers.length === 0) return;

    if (selectedUsers.length === 1) {
      dmMutation.mutate({ otherUserId: selectedUsers[0].id });
    } else {
      groupMutation.mutate({
        name: groupName.trim() || undefined,
        memberIds: selectedUsers.map((u) => u.id),
      });
    }
  };

  const isPending = dmMutation.isPending || groupMutation.isPending;
  const error = dmMutation.error || groupMutation.error;

  // Filter out already-selected users from results
  const filteredResults = searchResults.data?.filter(
    (user) => !selectedUsers.find((u) => u.id === user.id)
  );

  const isGroup = selectedUsers.length >= 2;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Selected users as chips */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedUsers.map((user) => (
                <Badge
                  key={user.id}
                  variant="secondary"
                  className="gap-1 pr-1"
                >
                  <span>{user.displayName || user.username}</span>
                  <button
                    type="button"
                    onClick={() => removeUser(user.id)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Search input */}
          <div className="relative">
            <Input
              ref={inputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users..."
              autoFocus
            />
            {searchResults.isFetching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Search results dropdown */}
          {debouncedQuery.length >= 1 && (
            <div className="rounded-md border">
              {searchResults.isLoading ? (
                <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </div>
              ) : filteredResults && filteredResults.length > 0 ? (
                <ScrollArea className="max-h-48">
                  <div className="p-1">
                    {filteredResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => addUser(user)}
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-accent transition-colors"
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
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No users found
                </p>
              )}
            </div>
          )}

          {/* Group name input (only when 2+ users selected) */}
          {isGroup && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>Group chat with {selectedUsers.length} people</span>
              </div>
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name (optional)"
              />
            </div>
          )}

          {/* Start conversation button */}
          <Button
            onClick={handleStartConversation}
            disabled={selectedUsers.length === 0 || isPending}
            className="w-full"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isGroup ? "Create Group Chat" : "Start Conversation"}
          </Button>

          {error && (
            <p className="text-sm text-destructive">{error.message}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
