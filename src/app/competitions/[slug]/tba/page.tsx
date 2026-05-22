"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@shared/ui/button";
import { Label } from "@shared/ui/label";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { Textarea } from "@shared/ui/textarea";
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
import { Plus, Trash2 } from "lucide-react";

const styles = ["standard", "smooth", "latin", "rhythm", "nightclub"] as const;
const levels = [
  "newcomer", "bronze", "silver", "gold", "novice", "prechamp", "champ", "professional",
] as const;

export default function TBAPage() {
  const { slug } = useParams<{ slug: string }>();
  const comp = useQuery(api.competitions.core.getBySlug, { slug });
  const [filterStyle, setFilterStyle] = useState<string>("");
  const [filterLevel, setFilterLevel] = useState<string>("");
  const [filterRole, setFilterRole] = useState<string>("");

  const listings = useQuery(
    api.competitions.tba.listByCompetition,
    comp
      ? {
          competitionId: comp._id,
          style: (filterStyle || undefined) as (typeof styles)[number] | undefined,
          level: (filterLevel || undefined) as (typeof levels)[number] | undefined,
          role: (filterRole || undefined) as "leader" | "follower" | undefined,
        }
      : "skip",
  );
  const isLoading = listings === undefined;

  const createListing = useMutation(api.competitions.tba.create);
  const deleteListing = useMutation(api.competitions.tba.remove);

  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<Id<"tbaListings"> | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newStyle, setNewStyle] = useState<string>("standard");
  const [newLevel, setNewLevel] = useState<string>("newcomer");
  const [newRole, setNewRole] = useState<string>("leader");
  const [newNotes, setNewNotes] = useState("");

  if (isLoading || !comp) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  async function handleCreate() {
    if (!comp) return;
    setCreating(true);
    try {
      await createListing({
        competitionId: comp._id,
        style: newStyle as (typeof styles)[number],
        level: newLevel as (typeof levels)[number],
        role: newRole as "leader" | "follower",
        notes: newNotes || undefined,
      });
      toast.success("Listing posted");
      setShowCreate(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(listingId: Id<"tbaListings">) {
    setDeletingId(listingId);
    try {
      await deleteListing({ listingId });
      toast.success("Listing removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{comp.name}</h1>
          <p className="text-muted-foreground">Partner Finder (TBA)</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="size-4 mr-2" />
          Post Listing
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filterStyle} onValueChange={setFilterStyle}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Styles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Styles</SelectItem>
            {styles.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterLevel} onValueChange={setFilterLevel}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {levels.map((l) => (
              <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="leader">Looking for Leader</SelectItem>
            <SelectItem value="follower">Looking for Follower</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!listings?.length ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No listings found. Post one to find a partner!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {listings.map((listing) => (
            <Card key={listing._id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {listing.displayName ?? listing.username ?? "Anonymous"}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        Looking for {listing.role === "leader" ? "Leader" : "Follower"}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Badge variant="secondary" className="text-xs capitalize">
                        {listing.style}
                      </Badge>
                      <Badge variant="secondary" className="text-xs capitalize">
                        {listing.level}
                      </Badge>
                    </div>
                    {listing.notes && (
                      <p className="text-sm text-muted-foreground mt-1">{listing.notes}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive"
                    disabled={deletingId === listing._id}
                    onClick={() => handleDelete(listing._id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Listing Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post a Listing</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Style</Label>
                <Select value={newStyle} onValueChange={setNewStyle}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {styles.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Level</Label>
                <Select value={newLevel} onValueChange={setNewLevel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {levels.map((l) => (
                      <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Looking for</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leader">Leader</SelectItem>
                    <SelectItem value="follower">Follower</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Any additional details..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? "Posting..." : "Post Listing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
