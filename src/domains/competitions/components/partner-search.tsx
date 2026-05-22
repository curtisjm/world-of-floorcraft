"use client";

import { useState, useEffect, useRef } from "react";
import { trpc } from "@shared/lib/trpc";
import { Input } from "@shared/ui/input";
import { Badge } from "@shared/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Loader2, Search } from "lucide-react";

type PartnerResult = {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  registrationId: number | null;
};

interface PartnerSearchProps {
  competitionId: number;
  onSelect: (partner: PartnerResult) => void;
  excludeUserIds?: string[];
  placeholder?: string;
}

export function PartnerSearch({
  competitionId,
  onSelect,
  excludeUserIds = [],
  placeholder = "Search by name or username...",
}: PartnerSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: results, isLoading } = trpc.registration.searchPartners.useQuery(
    { competitionId, query: debouncedQuery },
    { enabled: debouncedQuery.length >= 1 },
  );

  const filtered = results?.filter((r) => !excludeUserIds.includes(r.userId)) ?? [];

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          placeholder={placeholder}
          className="pl-9"
        />
        {isLoading && debouncedQuery.length >= 1 && (
          <Loader2 className="absolute right-2.5 top-2.5 size-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {showResults && debouncedQuery.length >= 1 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-[2px] border bg-popover shadow-none">
          {filtered.length === 0 && !isLoading ? (
            <div className="p-3 text-sm text-muted-foreground text-center">
              No users found
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto p-1">
              {filtered.map((user) => (
                <button
                  key={user.userId}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-sm p-2 text-left hover:bg-accent/50"
                  onClick={() => {
                    onSelect(user);
                    setSearchQuery("");
                    setDebouncedQuery("");
                    setShowResults(false);
                  }}
                >
                  <Avatar className="size-8">
                    <AvatarImage src={user.avatarUrl ?? undefined} />
                    <AvatarFallback>
                      {(user.displayName ?? user.username ?? "?")[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {user.displayName ?? user.username}
                    </div>
                    {user.username && (
                      <div className="text-xs text-muted-foreground truncate">
                        @{user.username}
                      </div>
                    )}
                  </div>
                  <Badge
                    variant={user.registrationId ? "default" : "secondary"}
                    className="text-xs shrink-0"
                  >
                    {user.registrationId ? "Registered" : "New"}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
