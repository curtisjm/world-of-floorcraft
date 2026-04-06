"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Checkbox } from "@shared/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Wand2 } from "lucide-react";

const styles = ["standard", "smooth", "latin", "rhythm", "nightclub"] as const;
const levels = [
  "newcomer", "bronze", "silver", "gold", "novice", "prechamp", "champ", "professional",
] as const;

const dancesByStyle: Record<string, string[]> = {
  standard: ["Waltz", "Tango", "Foxtrot", "Quickstep", "Viennese Waltz"],
  smooth: ["Waltz", "Tango", "Foxtrot", "Viennese Waltz"],
  latin: ["Cha Cha", "Samba", "Rumba", "Paso Doble", "Jive"],
  rhythm: ["Cha Cha", "Rumba", "Swing", "Bolero", "Mambo"],
  nightclub: ["Night Club Two Step", "West Coast Swing", "Hustle"],
};

const eventSchema = z.object({
  name: z.string().min(1, "Name is required"),
  style: z.enum(styles),
  level: z.enum(levels),
  eventType: z.enum(["single_dance", "multi_dance"]),
  dances: z.string().array().min(1, "Select at least one dance"),
});

type EventFormData = z.infer<typeof eventSchema>;

export default function EventsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });
  const {
    data: events,
    isLoading,
  } = trpc.event.listByCompetition.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );
  const { data: schedule } = trpc.schedule.getDays.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );

  const utils = trpc.useUtils();
  const invalidate = () => {
    utils.event.listByCompetition.invalidate({ competitionId: comp!.id });
    utils.competition.getForDashboard.invalidate({ competitionId: comp!.id });
  };

  const generateDefaults = trpc.event.generateDefaults.useMutation({
    onSuccess: (created) => {
      invalidate();
      toast.success(`Generated ${created.length} events`);
      setShowGenerate(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const createEvent = trpc.event.create.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Event created");
      setShowCreate(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteEvent = trpc.event.delete.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Event deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  // Group events by session
  const sessions = schedule?.flatMap((d) => d.blocks.filter((b) => b.type === "session")) ?? [];
  const sessionMap = new Map(sessions.map((s) => [s.id, s.label]));

  const eventsBySession = new Map<number | null, typeof events>();
  events?.forEach((e) => {
    const key = e.sessionId;
    if (!eventsBySession.has(key)) eventsBySession.set(key, []);
    eventsBySession.get(key)!.push(e);
  });

  // Create event form
  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      name: "",
      style: "standard",
      level: "newcomer",
      eventType: "single_dance",
      dances: [],
    },
  });

  const watchedStyle = form.watch("style");
  const availableDances = dancesByStyle[watchedStyle] ?? [];

  const onCreateSubmit = (data: EventFormData) => {
    if (!comp) return;
    createEvent.mutate({
      competitionId: comp.id,
      ...data,
    });
  };

  if (isLoading || !comp) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const hasEvents = events && events.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Events{hasEvents ? ` (${events!.length})` : ""}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowGenerate(true)}>
            <Wand2 className="size-4 mr-2" />
            Generate Defaults
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="size-4 mr-2" />
            Add Event
          </Button>
        </div>
      </div>

      {!hasEvents ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No events yet.</p>
          <p className="text-sm mt-1">
            Generate default events from dance styles, or add them manually.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Events grouped by session */}
          {Array.from(eventsBySession.entries()).map(([sessionId, sessionEvents]) => (
            <Card key={sessionId ?? "unassigned"}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {sessionId ? sessionMap.get(sessionId) ?? "Session" : "Unassigned"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {sessionEvents!.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center justify-between p-3 rounded-md border"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{event.name}</span>
                          <Badge variant="secondary" className="text-xs capitalize">
                            {event.style}
                          </Badge>
                          <Badge variant="secondary" className="text-xs capitalize">
                            {event.level}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {event.eventType === "multi_dance" ? "Multi" : "Single"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {event.dances.map((d) => d.danceName).join(", ")}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:text-destructive shrink-0"
                        onClick={() => {
                          if (confirm(`Delete "${event.name}"?`)) {
                            deleteEvent.mutate({ eventId: event.id });
                          }
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Generate Defaults Dialog */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Default Events</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Select dance styles to generate events for all levels with standard groupings.
          </p>
          <div className="space-y-3 mt-2">
            {styles.map((style) => (
              <label
                key={style}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer"
              >
                <Checkbox
                  checked={selectedStyles.includes(style)}
                  onCheckedChange={(checked) => {
                    setSelectedStyles((prev) =>
                      checked
                        ? [...prev, style]
                        : prev.filter((s) => s !== style),
                    );
                  }}
                />
                <span className="text-sm font-medium capitalize">{style}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                generateDefaults.mutate({
                  competitionId: comp.id,
                  styles: selectedStyles as any,
                });
              }}
              disabled={generateDefaults.isPending || selectedStyles.length === 0}
            >
              {generateDefaults.isPending
                ? "Generating..."
                : `Generate (${selectedStyles.length} style${selectedStyles.length !== 1 ? "s" : ""})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Event Dialog */}
      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) form.reset();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Event</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Event Name</Label>
              <Input {...form.register("name")} placeholder="e.g. Gold Standard Waltz" />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Style</Label>
                <Controller
                  control={form.control}
                  name="style"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        form.setValue("dances", []);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {styles.map((s) => (
                          <SelectItem key={s} value={s} className="capitalize">
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Level</Label>
                <Controller
                  control={form.control}
                  name="level"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {levels.map((l) => (
                          <SelectItem key={l} value={l} className="capitalize">
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Event Type</Label>
              <Controller
                control={form.control}
                name="eventType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single_dance">Single Dance</SelectItem>
                      <SelectItem value="multi_dance">Multi Dance</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Dances</Label>
              <Controller
                control={form.control}
                name="dances"
                render={({ field }) => (
                  <div className="space-y-2">
                    {availableDances.map((dance) => (
                      <label
                        key={dance}
                        className="flex items-center gap-2 p-1.5 rounded hover:bg-accent/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={field.value.includes(dance)}
                          onCheckedChange={(checked) => {
                            const newVal = checked
                              ? [...field.value, dance]
                              : field.value.filter((d) => d !== dance);
                            field.onChange(newVal);
                          }}
                        />
                        <span className="text-sm">{dance}</span>
                      </label>
                    ))}
                  </div>
                )}
              />
              {form.formState.errors.dances && (
                <p className="text-sm text-destructive">{form.formState.errors.dances.message}</p>
              )}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={createEvent.isPending}>
                {createEvent.isPending ? "Creating..." : "Create Event"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
