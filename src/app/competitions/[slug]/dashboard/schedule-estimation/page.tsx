"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { Badge } from "@shared/ui/badge";
import { toast } from "sonner";
import { Clock, Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@shared/ui/dialog";

export default function ScheduleEstimationPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });
  const {
    data: schedule,
    isLoading,
    refetch,
  } = trpc.scheduleEstimation.getEstimatedSchedule.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );

  const updateSettings = trpc.scheduleEstimation.updateCompSettings.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Settings updated");
      setShowSettings(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const setOverride = trpc.scheduleEstimation.setEventOverride.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Override saved");
    },
    onError: (err) => toast.error(err.message),
  });

  const removeOverride = trpc.scheduleEstimation.removeEventOverride.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Override removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const [showSettings, setShowSettings] = useState(false);
  const [minutesPerCouple, setMinutesPerCouple] = useState("1.5");
  const [transitionMin, setTransitionMin] = useState("2.0");

  if (isLoading || !comp) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Schedule Estimation</h2>
        <Button variant="outline" onClick={() => setShowSettings(true)}>
          <Settings className="size-4 mr-2" />
          Settings
        </Button>
      </div>

      {schedule && (
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>Minutes/couple/dance: {schedule.minutesPerCouplePerDance}</span>
          <span>·</span>
          <span>Transition: {schedule.transitionMinutes} min</span>
        </div>
      )}

      {!schedule?.schedule?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          No schedule to estimate. Set up the schedule first.
        </div>
      ) : (
        schedule.schedule.map((day: any) => (
          <Card key={day.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {day.label ?? "Day"} {day.date && <span className="text-muted-foreground font-normal ml-2">{day.date}</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {day.blocks?.map((block: any) => (
                <div key={block.id} className="mb-4 last:mb-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium">{block.label}</span>
                    <Badge variant="outline" className="text-xs">
                      {block.type === "session" ? "Session" : "Break"}
                    </Badge>
                    {block.estimatedMinutes && (
                      <span className="text-xs text-muted-foreground">
                        ~{Math.round(block.estimatedMinutes)} min
                      </span>
                    )}
                  </div>
                  {block.events?.length > 0 && (
                    <div className="space-y-1 ml-4">
                      {block.events.map((event: any) => (
                        <div
                          key={event.id}
                          className="flex items-center justify-between text-xs p-1.5 rounded border"
                        >
                          <div className="flex items-center gap-2">
                            <Clock className="size-3 text-muted-foreground" />
                            <span>{event.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              {event.hasOverride ? `${event.estimatedMinutes} min (override)` : `~${Math.round(event.estimatedMinutes ?? 0)} min`}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estimation Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Minutes per Couple per Dance</Label>
              <Input
                value={minutesPerCouple}
                onChange={(e) => setMinutesPerCouple(e.target.value)}
                placeholder="1.5"
              />
            </div>
            <div className="space-y-2">
              <Label>Transition Minutes</Label>
              <Input
                value={transitionMin}
                onChange={(e) => setTransitionMin(e.target.value)}
                placeholder="2.0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                updateSettings.mutate({
                  competitionId: comp.id,
                  minutesPerCouplePerDance: minutesPerCouple,
                  transitionMinutes: transitionMin,
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
