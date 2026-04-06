"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Badge } from "@shared/ui/badge";
import { Skeleton } from "@shared/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@shared/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Search } from "lucide-react";

const staffRoles = [
  "scrutineer",
  "chairman",
  "emcee",
  "deck_captain",
  "registration",
] as const;

const roleLabels: Record<string, string> = {
  scrutineer: "Scrutineer",
  chairman: "Chairman",
  judge: "Judge",
  emcee: "Emcee",
  deck_captain: "Deck Captain",
  registration: "Registration",
};

export default function StaffPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });
  const {
    data: staffList,
    isLoading,
  } = trpc.staff.listByCompetition.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );

  const utils = trpc.useUtils();
  const invalidate = () => {
    utils.staff.listByCompetition.invalidate({ competitionId: comp!.id });
    utils.competition.getForDashboard.invalidate({ competitionId: comp!.id });
  };

  const assignStaff = trpc.staff.assign.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Staff member assigned");
      setShowAssign(false);
      setSearchQuery("");
      setSearchResults([]);
    },
    onError: (err) => toast.error(err.message),
  });

  const removeStaff = trpc.staff.remove.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Staff member removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const [showAssign, setShowAssign] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("scrutineer");
  const [searchResults, setSearchResults] = useState<
    { id: string; username: string | null; displayName: string | null; avatarUrl: string | null }[]
  >([]);

  const userSearch = trpc.profile.search.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length >= 1 },
  );

  // Group staff by role
  const staffByRole = new Map<string, typeof staffList>();
  staffList?.forEach((s) => {
    if (!staffByRole.has(s.role)) staffByRole.set(s.role, []);
    staffByRole.get(s.role)!.push(s);
  });

  if (isLoading || !comp) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const hasStaff = staffList && staffList.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Staff{hasStaff ? ` (${staffList!.length})` : ""}
        </h2>
        <Button onClick={() => setShowAssign(true)}>
          <Plus className="size-4 mr-2" />
          Assign Staff
        </Button>
      </div>

      {!hasStaff ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No staff assigned yet.</p>
          <p className="text-sm mt-1">
            Assign users to roles like scrutineer, chairman, emcee, and more.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(staffByRole.entries()).map(([role, members]) => (
            <div key={role} className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground capitalize">
                {roleLabels[role] ?? role}
              </h3>
              {members!.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-md border"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="text-sm font-medium">
                        {member.displayName ?? member.username ?? "Unknown"}
                      </span>
                      {member.username && member.displayName && (
                        <span className="text-xs text-muted-foreground ml-2">
                          @{member.username}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive hover:text-destructive shrink-0"
                    onClick={() => {
                      if (confirm(`Remove ${member.displayName ?? member.username} as ${roleLabels[role]}?`)) {
                        removeStaff.mutate({
                          competitionId: comp.id,
                          userId: member.userId,
                          role: role as any,
                        });
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Assign Staff Dialog */}
      <Dialog
        open={showAssign}
        onOpenChange={(open) => {
          setShowAssign(open);
          if (!open) {
            setSearchQuery("");
            setSelectedUserId(null);
            setSearchResults([]);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Staff Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {staffRoles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleLabels[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Search Users</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSelectedUserId(null);
                  }}
                  placeholder="Search by name or username..."
                  className="pl-9"
                />
              </div>

              {searchQuery.length >= 1 && (
                <div className="border rounded-md max-h-48 overflow-y-auto">
                  {userSearch.isLoading ? (
                    <div className="p-3 text-sm text-muted-foreground">Searching...</div>
                  ) : !userSearch.data?.length ? (
                    <div className="p-3 text-sm text-muted-foreground">No users found</div>
                  ) : (
                    userSearch.data.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/50 transition-colors ${
                          selectedUserId === user.id ? "bg-accent" : ""
                        }`}
                        onClick={() => setSelectedUserId(user.id)}
                      >
                        <span className="font-medium">
                          {user.displayName ?? user.username}
                        </span>
                        {user.username && (
                          <span className="text-muted-foreground ml-2">
                            @{user.username}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                if (selectedUserId && comp) {
                  assignStaff.mutate({
                    competitionId: comp.id,
                    userId: selectedUserId,
                    role: selectedRole as any,
                  });
                }
              }}
              disabled={assignStaff.isPending || !selectedUserId}
            >
              {assignStaff.isPending ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
