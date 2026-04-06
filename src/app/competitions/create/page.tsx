"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import { Checkbox } from "@shared/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Building2,
  CalendarDays,
  Trophy,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@shared/lib/utils";

// ── Step 1: Basic Info ─────────────────────────────────────────

const basicInfoSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  orgId: z.number({ required_error: "Select an organization" }),
  description: z.string().optional(),
  venueName: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
});

type BasicInfoData = z.infer<typeof basicInfoSchema>;

// ── Step schemas ───────────────────────────────────────────────

const styles = ["standard", "smooth", "latin", "rhythm", "nightclub"] as const;

const steps = [
  { label: "Basic Info", icon: Building2 },
  { label: "Schedule", icon: CalendarDays },
  { label: "Events", icon: Trophy },
  { label: "Review", icon: ClipboardCheck },
];

export default function CreateCompetitionPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [createdComp, setCreatedComp] = useState<{
    id: number;
    slug: string;
    name: string;
  } | null>(null);
  const [scheduleApplied, setScheduleApplied] = useState(false);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [eventsGenerated, setEventsGenerated] = useState(false);

  // Org list for the selector
  const { data: userOrgs, isLoading: orgsLoading } = trpc.org.listUserOrgs.useQuery();
  const adminOrgs = userOrgs?.filter((o) => o.role === "admin");

  // Step 1: Create competition
  const basicForm = useForm<BasicInfoData>({
    resolver: zodResolver(basicInfoSchema),
    defaultValues: { name: "", description: "", venueName: "", city: "", state: "" },
  });

  const createMutation = trpc.competition.create.useMutation({
    onSuccess: (comp) => {
      if (!comp) return;
      setCreatedComp({ id: comp.id, slug: comp.slug, name: comp.name });
      toast.success("Competition created as draft");
      setCurrentStep(1);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.competition.update.useMutation({
    onError: (err) => toast.error(err.message),
  });

  // Step 2: Schedule template
  const applyTemplate = trpc.schedule.applyDefaultTemplate.useMutation({
    onSuccess: () => {
      setScheduleApplied(true);
      toast.success("Schedule template applied");
    },
    onError: (err) => toast.error(err.message),
  });

  // Step 3: Generate events
  const generateEvents = trpc.event.generateDefaults.useMutation({
    onSuccess: (created) => {
      setEventsGenerated(true);
      toast.success(`Generated ${created.length} events`);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleStep1Submit = basicForm.handleSubmit((data) => {
    if (createdComp) {
      updateMutation.mutate(
        {
          competitionId: createdComp.id,
          name: data.name,
          description: data.description || null,
          venueName: data.venueName || null,
          city: data.city || null,
          state: data.state || null,
        },
        { onSuccess: () => setCurrentStep(1) },
      );
    } else {
      createMutation.mutate(
        { name: data.name, orgId: data.orgId },
        {
          onSuccess: (comp) => {
            if (!comp) return;
            setCreatedComp({ id: comp.id, slug: comp.slug, name: comp.name });
            toast.success("Competition created as draft");

            // Update with optional fields
            if (data.description || data.venueName || data.city || data.state) {
              updateMutation.mutate({
                competitionId: comp.id,
                description: data.description || null,
                venueName: data.venueName || null,
                city: data.city || null,
                state: data.state || null,
              });
            }
            setCurrentStep(1);
          },
        },
      );
    }
  });

  if (orgsLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!adminOrgs?.length) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <Building2 className="size-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">No Organizations</h2>
        <p className="text-muted-foreground mb-4">
          You need to be an admin or owner of an organization to create a competition.
        </p>
        <Button onClick={() => router.push("/orgs")}>Go to Organizations</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8 px-4">
      <h1 className="text-2xl font-bold">Create Competition</h1>

      {/* Step indicator */}
      <nav className="flex items-center gap-2">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const isActive = i === currentStep;
          const isComplete = i < currentStep;

          return (
            <div key={step.label} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={cn(
                    "h-px w-8",
                    isComplete ? "bg-primary" : "bg-border",
                  )}
                />
              )}
              <div
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors",
                  isActive && "bg-primary text-primary-foreground",
                  isComplete && "bg-primary/10 text-primary",
                  !isActive && !isComplete && "text-muted-foreground",
                )}
              >
                {isComplete ? (
                  <Check className="size-4" />
                ) : (
                  <Icon className="size-4" />
                )}
                <span className="hidden sm:inline">{step.label}</span>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Step 1: Basic Info */}
      {currentStep === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleStep1Submit} className="space-y-4">
              <div className="space-y-2">
                <Label>Organization</Label>
                <Controller
                  control={basicForm.control}
                  name="orgId"
                  render={({ field }) => (
                    <Select
                      value={field.value?.toString() ?? ""}
                      onValueChange={(v) => field.onChange(Number(v))}
                      disabled={!!createdComp}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select an organization" />
                      </SelectTrigger>
                      <SelectContent>
                        {adminOrgs.map((org) => (
                          <SelectItem key={org.id} value={org.id.toString()}>
                            {org.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {basicForm.formState.errors.orgId && (
                  <p className="text-sm text-destructive">
                    {basicForm.formState.errors.orgId.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Competition Name</Label>
                <Input
                  {...basicForm.register("name")}
                  placeholder="e.g. Fall Classic 2026"
                />
                {basicForm.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {basicForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea
                  {...basicForm.register("description")}
                  rows={3}
                  placeholder="Brief description of the competition"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Venue (optional)</Label>
                  <Input
                    {...basicForm.register("venueName")}
                    placeholder="Venue name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input {...basicForm.register("city")} placeholder="City" />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input {...basicForm.register("state")} placeholder="State" />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending
                    ? "Creating..."
                    : updateMutation.isPending
                      ? "Saving..."
                      : createdComp
                        ? "Next"
                        : "Create & Continue"}
                  <ArrowRight className="size-4 ml-2" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Schedule */}
      {currentStep === 1 && createdComp && (
        <Card>
          <CardHeader>
            <CardTitle>Schedule Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Apply the default schedule template to get started quickly. You can
              customize it later from the dashboard.
            </p>

            {scheduleApplied ? (
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/10 text-green-800 dark:text-green-400 text-sm">
                <Check className="size-4 inline mr-2" />
                Default schedule template applied. You can customize it from the dashboard.
              </div>
            ) : (
              <Button
                onClick={() => {
                  const today = new Date().toISOString().split("T")[0]!;
                  applyTemplate.mutate({
                    competitionId: createdComp.id,
                    date: today,
                  });
                }}
                disabled={applyTemplate.isPending}
              >
                {applyTemplate.isPending
                  ? "Applying..."
                  : "Apply Default Template"}
              </Button>
            )}

            <div className="flex justify-between pt-4">
              <Button
                variant="ghost"
                onClick={() => setCurrentStep(0)}
              >
                <ArrowLeft className="size-4 mr-2" />
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCurrentStep(2)}
                >
                  Skip
                </Button>
                <Button onClick={() => setCurrentStep(2)}>
                  Next
                  <ArrowRight className="size-4 ml-2" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Events */}
      {currentStep === 2 && createdComp && (
        <Card>
          <CardHeader>
            <CardTitle>Generate Events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select dance styles to auto-generate events for all levels with
              standard groupings. You can customize events later.
            </p>

            {eventsGenerated ? (
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/10 text-green-800 dark:text-green-400 text-sm">
                <Check className="size-4 inline mr-2" />
                Events generated. You can customize them from the dashboard.
              </div>
            ) : (
              <>
                <div className="space-y-3">
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
                      <span className="text-sm font-medium capitalize">
                        {style}
                      </span>
                    </label>
                  ))}
                </div>

                <Button
                  onClick={() => {
                    generateEvents.mutate({
                      competitionId: createdComp.id,
                      styles: selectedStyles as any,
                    });
                  }}
                  disabled={
                    generateEvents.isPending || selectedStyles.length === 0
                  }
                >
                  {generateEvents.isPending
                    ? "Generating..."
                    : `Generate Events (${selectedStyles.length} style${selectedStyles.length !== 1 ? "s" : ""})`}
                </Button>
              </>
            )}

            <div className="flex justify-between pt-4">
              <Button
                variant="ghost"
                onClick={() => setCurrentStep(1)}
              >
                <ArrowLeft className="size-4 mr-2" />
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCurrentStep(3)}
                >
                  Skip
                </Button>
                <Button onClick={() => setCurrentStep(3)}>
                  Next
                  <ArrowRight className="size-4 ml-2" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Review */}
      {currentStep === 3 && createdComp && (
        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Competition</p>
                <p className="font-medium">{createdComp.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Schedule</p>
                <p className="text-sm">
                  {scheduleApplied
                    ? "Default template applied"
                    : "Not set up — configure from dashboard"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Events</p>
                <p className="text-sm">
                  {eventsGenerated
                    ? `Generated for ${selectedStyles.length} style${selectedStyles.length !== 1 ? "s" : ""}`
                    : "Not generated — configure from dashboard"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="text-sm">
                  Draft — you can advertise it from the dashboard when ready.
                </p>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <Button
                variant="ghost"
                onClick={() => setCurrentStep(2)}
              >
                <ArrowLeft className="size-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={() =>
                  router.push(
                    `/competitions/${createdComp.slug}/dashboard`,
                  )
                }
              >
                Go to Dashboard
                <ArrowRight className="size-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
