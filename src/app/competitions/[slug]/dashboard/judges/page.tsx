"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
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
import { toast } from "sonner";
import { Plus, Trash2, Search, UserPlus, Pencil } from "lucide-react";

const judgeSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  initials: z.string().max(5).optional(),
  affiliation: z.string().optional(),
});

type JudgeFormData = z.infer<typeof judgeSchema>;

export default function JudgesPage() {
  const { slug } = useParams<{ slug: string }>();
  const comp = useQuery(api.competitions.core.getBySlug, { slug, includeArchived: true });
  const assignedJudges = useQuery(
    api.competitions.judges.listByCompetition,
    comp ? { competitionId: comp._id } : "skip",
  );
  const isLoading = comp === undefined || assignedJudges === undefined;

  const assignJudgeMutation = useMutation(api.competitions.judges.assignToCompetition);
  const removeJudgeMutation = useMutation(api.competitions.judges.removeFromCompetition);
  const createJudgeMutation = useMutation(api.competitions.judges.create);
  const updateJudgeMutation = useMutation(api.competitions.judges.update);

  const [assignPending, setAssignPending] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [updatePending, setUpdatePending] = useState(false);

  const [showSearch, setShowSearch] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editJudge, setEditJudge] = useState<{
    judgeId: Id<"judges">;
    firstName: string;
    lastName: string;
    initials: string;
    affiliation: string;
  } | null>(null);

  const judgeSearchResults = useQuery(
    api.competitions.judges.search,
    searchQuery.length >= 1 ? { query: searchQuery } : "skip",
  );

  const createForm = useForm<JudgeFormData>({
    resolver: zodResolver(judgeSchema),
    defaultValues: { firstName: "", lastName: "", initials: "", affiliation: "" },
  });

  // Filter out already-assigned judges from search results
  const assignedIds = new Set(assignedJudges?.map((j) => j.judgeId) ?? []);
  const filteredResults = judgeSearchResults?.filter((j) => !assignedIds.has(j._id)) ?? [];

  if (isLoading || !comp) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const hasJudges = assignedJudges && assignedJudges.length > 0;

  const handleAssign = async (judgeId: Id<"judges">) => {
    setAssignPending(true);
    try {
      await assignJudgeMutation({ competitionId: comp._id, judgeId });
      toast.success("Judge assigned");
      setShowSearch(false);
      setSearchQuery("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setAssignPending(false);
    }
  };

  const handleRemove = async (judgeId: Id<"judges">, label: string) => {
    if (!confirm(`Remove ${label} from this competition?`)) return;
    try {
      await removeJudgeMutation({ competitionId: comp._id, judgeId });
      toast.success("Judge removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const onCreateSubmit = async (data: JudgeFormData) => {
    setCreatePending(true);
    try {
      const judge = await createJudgeMutation(data);
      if (judge) {
        await assignJudgeMutation({ competitionId: comp._id, judgeId: judge._id });
      }
      setShowCreate(false);
      createForm.reset();
      toast.success("Judge created and assigned");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setCreatePending(false);
    }
  };

  const handleUpdateJudge = async () => {
    if (!editJudge) return;
    setUpdatePending(true);
    try {
      await updateJudgeMutation({
        judgeId: editJudge.judgeId,
        firstName: editJudge.firstName,
        lastName: editJudge.lastName,
        initials: editJudge.initials || null,
        affiliation: editJudge.affiliation || null,
      });
      toast.success("Judge updated");
      setEditJudge(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setUpdatePending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Judges{hasJudges ? ` (${assignedJudges!.length})` : ""}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCreate(true)}>
            <UserPlus className="size-4 mr-2" />
            New Judge
          </Button>
          <Button onClick={() => setShowSearch(true)}>
            <Plus className="size-4 mr-2" />
            Add Judge
          </Button>
        </div>
      </div>

      {!hasJudges ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No judges assigned yet.</p>
          <p className="text-sm mt-1">
            Search the global judge directory to add existing judges, or create new ones.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {assignedJudges!.map((judge) => (
            <div
              key={judge._id}
              className="flex items-center justify-between p-3 rounded-md border"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {judge.firstName} {judge.lastName}
                  </span>
                  {judge.initials && (
                    <Badge variant="secondary" className="text-xs">
                      {judge.initials}
                    </Badge>
                  )}
                </div>
                {judge.affiliation && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {judge.affiliation}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() =>
                    setEditJudge({
                      judgeId: judge.judgeId,
                      firstName: judge.firstName ?? "",
                      lastName: judge.lastName ?? "",
                      initials: judge.initials ?? "",
                      affiliation: judge.affiliation ?? "",
                    })
                  }
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive hover:text-destructive"
                  onClick={() =>
                    handleRemove(
                      judge.judgeId,
                      `${judge.firstName} ${judge.lastName}`,
                    )
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search & Assign Judge Dialog */}
      <Dialog
        open={showSearch}
        onOpenChange={(open) => {
          setShowSearch(open);
          if (!open) setSearchQuery("");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Judge from Directory</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by judge name..."
                className="pl-9"
                autoFocus
              />
            </div>

            {searchQuery.length >= 1 && (
              <div className="border rounded-md max-h-64 overflow-y-auto">
                {judgeSearchResults === undefined ? (
                  <div className="p-3 text-sm text-muted-foreground">Searching...</div>
                ) : filteredResults.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    No judges found.{" "}
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => {
                        setShowSearch(false);
                        setShowCreate(true);
                      }}
                    >
                      Create a new judge
                    </button>
                  </div>
                ) : (
                  filteredResults.map((judge) => (
                    <div
                      key={judge._id}
                      className="flex items-center justify-between px-3 py-2 hover:bg-accent/50 transition-colors"
                    >
                      <div>
                        <span className="text-sm font-medium">
                          {judge.firstName} {judge.lastName}
                        </span>
                        {judge.initials && (
                          <span className="text-xs text-muted-foreground ml-2">
                            ({judge.initials})
                          </span>
                        )}
                        {judge.affiliation && (
                          <p className="text-xs text-muted-foreground">
                            {judge.affiliation}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleAssign(judge._id)}
                        disabled={assignPending}
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Judge Dialog */}
      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) createForm.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Judge</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={createForm.handleSubmit(onCreateSubmit)}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input {...createForm.register("firstName")} />
                {createForm.formState.errors.firstName && (
                  <p className="text-sm text-destructive">
                    {createForm.formState.errors.firstName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input {...createForm.register("lastName")} />
                {createForm.formState.errors.lastName && (
                  <p className="text-sm text-destructive">
                    {createForm.formState.errors.lastName.message}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Initials</Label>
                <Input
                  {...createForm.register("initials")}
                  placeholder="e.g. JD"
                  maxLength={5}
                />
              </div>
              <div className="space-y-2">
                <Label>Affiliation</Label>
                <Input
                  {...createForm.register("affiliation")}
                  placeholder="e.g. USA Dance"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createPending}>
                {createPending ? "Creating..." : "Create & Assign"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Judge Dialog */}
      <Dialog open={editJudge !== null} onOpenChange={() => setEditJudge(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Judge</DialogTitle>
          </DialogHeader>
          {editJudge && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input
                    value={editJudge.firstName}
                    onChange={(e) =>
                      setEditJudge({ ...editJudge, firstName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input
                    value={editJudge.lastName}
                    onChange={(e) =>
                      setEditJudge({ ...editJudge, lastName: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Initials</Label>
                  <Input
                    value={editJudge.initials}
                    onChange={(e) =>
                      setEditJudge({ ...editJudge, initials: e.target.value })
                    }
                    maxLength={5}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Affiliation</Label>
                  <Input
                    value={editJudge.affiliation}
                    onChange={(e) =>
                      setEditJudge({ ...editJudge, affiliation: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={handleUpdateJudge}
              disabled={updatePending}
            >
              {updatePending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
