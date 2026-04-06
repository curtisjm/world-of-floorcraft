"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
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
import { Hash, Wand2, Pencil, X } from "lucide-react";

export default function NumbersPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });
  const {
    data: assignments,
    isLoading,
    refetch,
  } = trpc.number.listAssignments.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );

  const autoAssign = trpc.number.autoAssign.useMutation({
    onSuccess: (result) => {
      refetch();
      toast.success(`Auto-assigned ${result.assigned} numbers`);
    },
    onError: (err) => toast.error(err.message),
  });

  const manualAssign = trpc.number.manualAssign.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Number assigned");
      setEditingReg(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const unassign = trpc.number.unassign.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Number removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateSettings = trpc.number.updateSettings.useMutation({
    onSuccess: () => {
      toast.success("Settings updated");
      setShowSettings(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const [editingReg, setEditingReg] = useState<{ id: number; name: string } | null>(null);
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

  const assigned = assignments?.filter((a: any) => a.competitorNumber) ?? [];
  const unassigned = assignments?.filter((a: any) => !a.competitorNumber) ?? [];

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
            onClick={() => autoAssign.mutate({ competitionId: comp.id })}
            disabled={autoAssign.isPending}
          >
            <Wand2 className="size-4 mr-2" />
            {autoAssign.isPending ? "Assigning..." : "Auto-Assign"}
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
              {assigned.map((a: any) => (
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
                        setEditingReg({ id: a.registrationId, name: a.displayName ?? a.username });
                        setManualNumber(String(a.competitorNumber));
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive"
                      onClick={() => unassign.mutate({ registrationId: a.registrationId })}
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
              {unassigned.map((a: any) => (
                <div key={a.registrationId} className="flex items-center justify-between p-2 rounded-md border">
                  <span className="text-sm">{a.displayName ?? a.username}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingReg({ id: a.registrationId, name: a.displayName ?? a.username });
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
              onClick={() => {
                if (editingReg && manualNumber) {
                  manualAssign.mutate({
                    registrationId: editingReg.id,
                    number: Number(manualNumber),
                  });
                }
              }}
              disabled={manualAssign.isPending || !manualNumber}
            >
              {manualAssign.isPending ? "Assigning..." : "Assign"}
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
              onClick={() => {
                updateSettings.mutate({
                  competitionId: comp.id,
                  numberStart: Number(numberStart),
                  numberExclusions: exclusions
                    ? exclusions.split(",").map((s) => Number(s.trim())).filter(Boolean)
                    : undefined,
                });
              }}
              disabled={updateSettings.isPending}
            >
              {updateSettings.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
