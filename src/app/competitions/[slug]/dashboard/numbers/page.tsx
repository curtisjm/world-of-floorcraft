"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@shared/ui/dialog";
import { toast } from "sonner";
import { Wand2, Pencil, X } from "lucide-react";

export default function NumbersPage() {
  const { slug } = useParams<{ slug: string }>();
  const comp = useQuery(api.competitions.core.getBySlug, { slug });
  const assignments = useQuery(
    api.competitions.numbers.listAssignments,
    comp ? { competitionId: comp._id } : "skip",
  );
  const isLoading = comp === undefined || assignments === undefined;

  const autoAssignMutation = useMutation(api.competitions.numbers.autoAssign);
  const manualAssignMutation = useMutation(api.competitions.numbers.manualAssign);
  const unassignMutation = useMutation(api.competitions.numbers.unassign);
  const updateSettingsMutation = useMutation(api.competitions.numbers.updateSettings);

  const [autoAssignPending, setAutoAssignPending] = useState(false);
  const [manualAssignPending, setManualAssignPending] = useState(false);
  const [updateSettingsPending, setUpdateSettingsPending] = useState(false);

  const [editingReg, setEditingReg] = useState<{
    id: Id<"competitionRegistrations">;
    name: string;
  } | null>(null);
  const [manualNumber, setManualNumber] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [numberStart, setNumberStart] = useState("1");
  const [exclusions, setExclusions] = useState("");

  if (isLoading || !comp) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const assigned = assignments?.filter((a) => a.competitorNumber) ?? [];
  const unassigned = assignments?.filter((a) => !a.competitorNumber) ?? [];

  const handleAutoAssign = async () => {
    setAutoAssignPending(true);
    try {
      const result = await autoAssignMutation({ competitionId: comp._id });
      toast.success(`Auto-assigned ${result.assigned} numbers`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setAutoAssignPending(false);
    }
  };

  const handleManualAssign = async () => {
    if (!editingReg || !manualNumber) return;
    setManualAssignPending(true);
    try {
      await manualAssignMutation({
        registrationId: editingReg.id,
        number: Number(manualNumber),
      });
      toast.success("Number assigned");
      setEditingReg(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setManualAssignPending(false);
    }
  };

  const handleUnassign = async (registrationId: Id<"competitionRegistrations">) => {
    try {
      await unassignMutation({ registrationId });
      toast.success("Number removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleUpdateSettings = async () => {
    setUpdateSettingsPending(true);
    try {
      await updateSettingsMutation({
        competitionId: comp._id,
        numberStart: Number(numberStart),
        numberExclusions: exclusions
          ? exclusions.split(",").map((s) => Number(s.trim())).filter(Boolean)
          : undefined,
      });
      toast.success("Settings updated");
      setShowSettings(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setUpdateSettingsPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Competitor Numbers
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
            Settings
          </Button>
          <Button
            onClick={handleAutoAssign}
            disabled={autoAssignPending}
          >
            <Wand2 className="size-4 mr-2" />
            {autoAssignPending ? "Assigning..." : "Auto-Assign"}
          </Button>
        </div>
      </div>

      {/* Assigned */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Assigned ({assigned.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {!assigned.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No numbers assigned yet.
            </p>
          ) : (
            <div className="space-y-1">
              {assigned.map((a) => (
                <div key={a.registrationId} className="flex items-center justify-between p-2 rounded-md border">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono font-bold">
                      #{a.competitorNumber}
                    </Badge>
                    <span className="text-sm">{a.displayName ?? a.username}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => {
                        setEditingReg({ id: a.registrationId, name: a.displayName ?? a.username ?? "Unknown" });
                        setManualNumber(String(a.competitorNumber));
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive"
                      onClick={() => handleUnassign(a.registrationId)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unassigned */}
      {unassigned.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Unassigned ({unassigned.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {unassigned.map((a) => (
                <div key={a.registrationId} className="flex items-center justify-between p-2 rounded-md border">
                  <span className="text-sm">{a.displayName ?? a.username}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingReg({ id: a.registrationId, name: a.displayName ?? a.username ?? "Unknown" });
                      setManualNumber("");
                    }}
                  >
                    Assign
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual Assign Dialog */}
      <Dialog open={editingReg !== null} onOpenChange={() => setEditingReg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Number</DialogTitle>
          </DialogHeader>
          {editingReg && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">For: {editingReg.name}</p>
              <div className="space-y-2">
                <Label>Number</Label>
                <Input
                  type="number"
                  min={1}
                  value={manualNumber}
                  onChange={(e) => setManualNumber(e.target.value)}
                  placeholder="Enter number"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={handleManualAssign}
              disabled={manualAssignPending || !manualNumber}
            >
              {manualAssignPending ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Number Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Starting Number</Label>
              <Input
                type="number"
                min={1}
                value={numberStart}
                onChange={(e) => setNumberStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Exclusions (comma-separated)</Label>
              <Input
                value={exclusions}
                onChange={(e) => setExclusions(e.target.value)}
                placeholder="e.g. 13, 666"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleUpdateSettings}
              disabled={updateSettingsPending}
            >
              {updateSettingsPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
