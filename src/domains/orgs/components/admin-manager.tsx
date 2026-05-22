"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Checkbox } from "@shared/ui/checkbox";
import { Input } from "@shared/ui/input";
import { convexErrorMessage } from "@social/lib/convex-error";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface AdminManagerProps {
  orgId: Id<"organizations">;
}

export function AdminManager({ orgId }: AdminManagerProps) {
  const [search, setSearch] = useState("");
  const [pendingUserId, setPendingUserId] = useState<Id<"users"> | null>(null);

  const members = useQuery(api.orgs.listMembers, { orgId });
  const updateRole = useMutation(api.orgs.updateRole);

  if (members === undefined) {
    return <p className="text-muted-foreground text-sm">Loading members...</p>;
  }

  const nonOwnerMembers = members.filter((m) => !m.isOwner);
  const filteredMembers = nonOwnerMembers.filter((m) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      (m.displayName?.toLowerCase().includes(query) ?? false) ||
      (m.username?.toLowerCase().includes(query) ?? false)
    );
  });

  const handleToggleRole = async (
    userId: Id<"users">,
    currentRole: "admin" | "member",
  ) => {
    setPendingUserId(userId);
    try {
      await updateRole({
        orgId,
        targetUserId: userId,
        role: currentRole === "admin" ? "member" : "admin",
      });
    } catch (err) {
      alert(convexErrorMessage(err, "Failed to update role"));
    } finally {
      setPendingUserId(null);
    }
  };

  if (nonOwnerMembers.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No members to manage. Invite people to join the organization first.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        placeholder="Search members..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="flex flex-col gap-1">
        {filteredMembers.length === 0 ? (
          <p className="text-muted-foreground text-sm">No members match your search.</p>
        ) : (
          filteredMembers.map((member) => {
            const isAdmin = member.role === "admin";
            const isPending = pendingUserId === member.userId;

            return (
              <label
                key={member.userId}
                className="flex cursor-pointer items-center gap-3 rounded-[2px] border border-transparent p-3 transition-colors hover:border-border hover:bg-accent/50"
              >
                <Checkbox
                  checked={isAdmin}
                  onCheckedChange={() => handleToggleRole(member.userId, member.role)}
                  disabled={isPending}
                />
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={member.avatarUrl ?? undefined} />
                  <AvatarFallback>
                    {(member.displayName ?? member.username ?? "?")[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {member.displayName ?? member.username}
                  </p>
                  {member.username && (
                    <p className="text-sm text-muted-foreground truncate">
                      @{member.username}
                    </p>
                  )}
                </div>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
