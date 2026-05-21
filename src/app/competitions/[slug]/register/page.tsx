"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc, type RouterOutput } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { Checkbox } from "@shared/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { toast } from "sonner";
import { cn } from "@shared/lib/utils";
import {
  UserPlus,
  Trophy,
  Users,
  ClipboardCheck,
  ArrowLeft,
  ArrowRight,
  Check,
  Info,
  Pencil,
  ExternalLink,
} from "lucide-react";
import { PartnerSearch } from "@competitions/components/partner-search";
import { EventFilterBar } from "@competitions/components/event-filter-bar";
import { PartnerEntriesSheet } from "@competitions/components/partner-entries-sheet";

// ── Types ─────────────────────────────────────────────────────────

type PartnerInfo = {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  registrationId: number | null;
};

type EntryAssignment = {
  eventId: number;
  leaderRegistrationId: number;
  followerRegistrationId: number;
  partner: PartnerInfo;
};

type MyRegistration = NonNullable<RouterOutput["registration"]["getMyRegistration"]>;
type MyRegistrationEntry = MyRegistration["entries"][number];

// ── Steps ─────────────────────────────────────────────────────────

const STEPS = [
  { label: "Register", icon: UserPlus },
  { label: "Events", icon: Trophy },
  { label: "Partners", icon: Users },
  { label: "Review", icon: ClipboardCheck },
];

// ── Component ─────────────────────────────────────────────────────

export default function RegisterPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { data: comp, isLoading: compLoading } = trpc.competition.getBySlug.useQuery({ slug });
  const { data: userOrgs } = trpc.org.listUserOrgs.useQuery();
  const { data: myReg, refetch: refetchReg } = trpc.registration.getMyRegistration.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );
  const { data: events } = trpc.event.listByCompetition.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );

  const utils = trpc.useUtils();

  // ── Mutations ─────────────────────────────────────────────────

  const registerMutation = trpc.registration.register.useMutation({
    onSuccess: () => {
      refetchReg();
      toast.success("Registered successfully");
      setCurrentStep(1);
    },
    onError: (err) => toast.error(err.message),
  });

  const ensurePartnerMutation = trpc.registration.ensurePartnerRegistered.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const bulkCreateEntries = trpc.entry.bulkCreate.useMutation({
    onSuccess: (created) => {
      refetchReg();
      toast.success(`Added ${created.length} entries`);
      setWizardMode(false);
      resetWizard();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeEntry = trpc.entry.remove.useMutation({
    onSuccess: () => {
      refetchReg();
      toast.success("Entry removed");
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Wizard State ──────────────────────────────────────────────

  const [wizardMode, setWizardMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  // Step 1: Event selection
  const [selectedEventIds, setSelectedEventIds] = useState<number[]>([]);
  const [eventSearch, setEventSearch] = useState("");
  const [styleFilter, setStyleFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  // Step 2: Partner assignments
  const [defaultRole, setDefaultRole] = useState<"leader" | "follower">("leader");
  const [defaultPartner, setDefaultPartner] = useState<PartnerInfo | null>(null);
  const [perEventPartner, setPerEventPartner] = useState<Map<number, PartnerInfo>>(new Map());
  const [perEventRole, setPerEventRole] = useState<Map<number, "leader" | "follower">>(new Map());
  const [editingEventId, setEditingEventId] = useState<number | null>(null);

  // Partner entries sheet
  const [sheetRegistrationId, setSheetRegistrationId] = useState<number | null>(null);

  function resetWizard() {
    setCurrentStep(myReg ? 1 : 0);
    setSelectedEventIds([]);
    setEventSearch("");
    setStyleFilter("all");
    setLevelFilter("all");
    setTypeFilter("all");
    setDefaultPartner(null);
    setPerEventPartner(new Map());
    setPerEventRole(new Map());
    setEditingEventId(null);
  }

  // ── Derived State ─────────────────────────────────────────────

  const isOpen = comp?.status === "accepting_entries";
  const isClosed =
    comp?.status === "entries_closed" ||
    comp?.status === "running" ||
    comp?.status === "finished";

  const enteredEventIds = new Set(myReg?.entries?.map((e) => e.eventId) ?? []);

  // Filter events for step 1
  const filteredEvents = useMemo(() => {
    if (!events) return [];
    return events.filter((e) => {
      if (eventSearch && !e.name.toLowerCase().includes(eventSearch.toLowerCase())) return false;
      if (styleFilter !== "all" && e.style !== styleFilter) return false;
      if (levelFilter !== "all" && e.level !== levelFilter) return false;
      if (typeFilter !== "all" && e.eventType !== typeFilter) return false;
      return true;
    });
  }, [events, eventSearch, styleFilter, levelFilter, typeFilter]);

  // Get partner for a specific event (per-event override or default)
  function getPartnerForEvent(eventId: number): PartnerInfo | null {
    return perEventPartner.get(eventId) ?? defaultPartner;
  }

  function getRoleForEvent(eventId: number): "leader" | "follower" {
    return perEventRole.get(eventId) ?? defaultRole;
  }

  // Check if all selected events have a valid partner
  const allEventsAssigned = selectedEventIds.every((id) => getPartnerForEvent(id) !== null);

  // Build entry assignments for review
  const entryAssignments: EntryAssignment[] = useMemo(() => {
    if (!myReg) return [];
    return selectedEventIds
      .map((eventId) => {
        const partner = getPartnerForEvent(eventId);
        if (!partner) return null;
        const role = getRoleForEvent(eventId);
        return {
          eventId,
          leaderRegistrationId: role === "leader" ? myReg.id : (partner.registrationId ?? 0),
          followerRegistrationId: role === "follower" ? myReg.id : (partner.registrationId ?? 0),
          partner,
        };
      })
      .filter((a): a is EntryAssignment => a !== null);
  }, [selectedEventIds, myReg, defaultPartner, defaultRole, perEventPartner, perEventRole]);

  // ── Handlers ──────────────────────────────────────────────────

  function handleRegister() {
    if (!comp) return;
    registerMutation.mutate({
      competitionId: comp.id,
      orgId: selectedOrgId && selectedOrgId !== "none" ? Number(selectedOrgId) : undefined,
    });
  }

  async function handleSubmitEntries() {
    if (!comp || !myReg) return;

    // Ensure all partners are registered
    const partnersToRegister = new Map<string, PartnerInfo>();
    for (const a of entryAssignments) {
      if (!a.partner.registrationId) {
        partnersToRegister.set(a.partner.userId, a.partner);
      }
    }

    // Register unregistered partners
    const registrationMap = new Map<string, number>();
    for (const [userId, partner] of partnersToRegister) {
      try {
        const reg = await ensurePartnerMutation.mutateAsync({
          competitionId: comp.id,
          partnerUserId: userId,
        });
        registrationMap.set(userId, reg.id);
      } catch {
        return; // Error already shown by onError
      }
    }

    // Build final entries with resolved registration IDs
    const resolvedEntries = entryAssignments.map((a) => {
      const role = getRoleForEvent(a.eventId);
      const partnerRegId = a.partner.registrationId ?? registrationMap.get(a.partner.userId)!;
      return {
        eventId: a.eventId,
        leaderRegistrationId: role === "leader" ? myReg.id : partnerRegId,
        followerRegistrationId: role === "follower" ? myReg.id : partnerRegId,
      };
    });

    bulkCreateEntries.mutate({ entries: resolvedEntries });
  }

  // ── Loading / Not Found ───────────────────────────────────────

  if (compLoading) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  if (!comp) return null;

  // Determine if we should show wizard or entries view
  const showWizard = wizardMode || (!myReg && isOpen);
  const effectiveStep = !myReg ? 0 : currentStep;

  // ── Entries Closed Banner ─────────────────────────────────────

  if (isClosed && myReg) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{comp.name}</h1>
          <p className="text-muted-foreground">Registration</p>
        </div>

        <Card className="status-clay">
          <CardContent className="py-4 flex items-start gap-3">
            <Info className="size-5 text-status-clay shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">
                Entries are closed
              </p>
              <p className="mt-1 text-muted-foreground">
                To make changes to your entries, submit an{" "}
                <Link
                  href={`/competitions/${slug}/add-drop`}
                  className="underline font-medium"
                >
                  Add/Drop Request
                </Link>
                .
              </p>
            </div>
          </CardContent>
        </Card>

        <RegistrationInfoCard reg={myReg} />
        <EntriesList
          entries={myReg.entries ?? []}
          myRegId={myReg.id}
          canRemove={false}
          onRemove={() => {}}
          onPartnerClick={(regId) => setSheetRegistrationId(regId)}
        />
        <PaymentCard reg={myReg} />

        {sheetRegistrationId && comp && (
          <PartnerEntriesSheet
            competitionId={comp.id}
            registrationId={sheetRegistrationId}
            slug={slug}
            open={!!sheetRegistrationId}
            onOpenChange={(open) => !open && setSheetRegistrationId(null)}
          />
        )}
      </div>
    );
  }

  // ── Not Open, No Registration ─────────────────────────────────

  if (!isOpen && !myReg) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{comp.name}</h1>
          <p className="text-muted-foreground">Registration</p>
        </div>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {comp.status === "draft" || comp.status === "advertised"
              ? "Registration is not yet open for this competition."
              : "Registration is closed."}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Post-Submission View (registered, entries open, not in wizard) ─

  if (myReg && !showWizard) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{comp.name}</h1>
          <p className="text-muted-foreground">Registration</p>
        </div>

        <RegistrationInfoCard reg={myReg} />

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Your Entries ({myReg.entries?.length ?? 0})
              </CardTitle>
              {isOpen && (
                <Button
                  size="sm"
                  onClick={() => {
                    setWizardMode(true);
                    setCurrentStep(1);
                  }}
                >
                  Add Entries
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <EntriesList
              entries={myReg.entries ?? []}
              myRegId={myReg.id}
              canRemove={isOpen}
              onRemove={(entryId) => {
                if (confirm("Remove this entry?")) {
                  removeEntry.mutate({ entryId });
                }
              }}
              onPartnerClick={(regId) => setSheetRegistrationId(regId)}
            />
          </CardContent>
        </Card>

        <PaymentCard reg={myReg} />

        {sheetRegistrationId && comp && (
          <PartnerEntriesSheet
            competitionId={comp.id}
            registrationId={sheetRegistrationId}
            slug={slug}
            open={!!sheetRegistrationId}
            onOpenChange={(open) => !open && setSheetRegistrationId(null)}
          />
        )}
      </div>
    );
  }

  // ── Wizard Mode ───────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{comp.name}</h1>
        <p className="text-muted-foreground">Registration</p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((step, i) => {
          // Skip step 0 if already registered
          if (i === 0 && myReg) return null;
          const StepIcon = step.icon;
          const isActive = i === effectiveStep;
          const isDone = i < effectiveStep;
          return (
            <div key={i} className="flex items-center gap-2">
              {i > (myReg ? 1 : 0) && (
                <div className={cn("h-px w-8", isDone ? "bg-primary" : "bg-border")} />
              )}
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {isDone ? (
                  <Check className="size-3.5" />
                ) : (
                  <StepIcon className="size-3.5" />
                )}
                <span className="hidden sm:inline">{step.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step 0: Register */}
      {effectiveStep === 0 && !myReg && (
        <Card>
          <CardHeader>
            <CardTitle>Register for this Competition</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Register yourself to start adding event entries.
            </p>
            {userOrgs && userOrgs.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Organization Affiliation (optional)</label>
                <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unaffiliated" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unaffiliated</SelectItem>
                    {userOrgs.map((org) => (
                      <SelectItem key={org.id} value={org.id.toString()}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={handleRegister} disabled={registerMutation.isPending}>
              {registerMutation.isPending ? "Registering..." : "Register"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Select Events */}
      {effectiveStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Select Events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <EventFilterBar
              searchQuery={eventSearch}
              onSearchChange={setEventSearch}
              styleFilter={styleFilter}
              onStyleChange={setStyleFilter}
              levelFilter={levelFilter}
              onLevelChange={setLevelFilter}
              typeFilter={typeFilter}
              onTypeChange={setTypeFilter}
            />

            <div className="space-y-1 max-h-[50vh] overflow-y-auto">
              {filteredEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No events match your filters.
                </p>
              ) : (
                filteredEvents.map((event) => {
                  const alreadyEntered = enteredEventIds.has(event.id);
                  const isSelected = selectedEventIds.includes(event.id);
                  return (
                    <label
                      key={event.id}
                      className={cn(
                        "flex items-center gap-3 p-2.5 rounded-lg cursor-pointer",
                        alreadyEntered ? "opacity-50" : "hover:bg-accent/50",
                      )}
                    >
                      <Checkbox
                        checked={isSelected || alreadyEntered}
                        disabled={alreadyEntered}
                        onCheckedChange={(checked) => {
                          setSelectedEventIds((prev) =>
                            checked
                              ? [...prev, event.id]
                              : prev.filter((id: number) => id !== event.id),
                          );
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium">{event.name}</span>
                        <div className="flex gap-1 mt-0.5">
                          <Badge variant="secondary" className="text-xs capitalize">
                            {event.style}
                          </Badge>
                          <Badge variant="secondary" className="text-xs capitalize">
                            {event.level}
                          </Badge>
                        </div>
                      </div>
                      {alreadyEntered && (
                        <Check className="size-4 text-status-sage shrink-0" />
                      )}
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex justify-between pt-2">
              {myReg && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setWizardMode(false);
                    resetWizard();
                  }}
                >
                  Cancel
                </Button>
              )}
              <Button
                className="ml-auto"
                disabled={selectedEventIds.length === 0}
                onClick={() => setCurrentStep(2)}
              >
                Next
                <ArrowRight className="size-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Assign Partners & Roles */}
      {effectiveStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Assign Partners & Roles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Default role */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Your default role</label>
              <div className="flex gap-2">
                <Button
                  variant={defaultRole === "leader" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDefaultRole("leader")}
                >
                  Leader
                </Button>
                <Button
                  variant={defaultRole === "follower" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDefaultRole("follower")}
                >
                  Follower
                </Button>
              </div>
            </div>

            {/* Default partner search */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Default partner</label>
              {defaultPartner ? (
                <div className="flex items-center gap-3 p-3 rounded-lg border">
                  <Avatar className="size-8">
                    <AvatarImage src={defaultPartner.avatarUrl ?? undefined} />
                    <AvatarFallback>
                      {(defaultPartner.displayName ?? defaultPartner.username ?? "?")[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {defaultPartner.displayName ?? defaultPartner.username}
                    </div>
                    {defaultPartner.username && (
                      <div className="text-xs text-muted-foreground">
                        @{defaultPartner.username}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDefaultPartner(null)}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <PartnerSearch
                  competitionId={comp.id}
                  onSelect={setDefaultPartner}
                  excludeUserIds={myReg ? [myReg.userId] : []}
                />
              )}
              <p className="text-xs text-muted-foreground">
                This partner will be assigned to all events below unless overridden.
              </p>
            </div>

            {/* Per-event assignments */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Event assignments</label>
              <div className="space-y-1">
                {selectedEventIds.map((eventId) => {
                  const event = events?.find((e) => e.id === eventId);
                  if (!event) return null;
                  const partner = getPartnerForEvent(eventId);
                  const role = getRoleForEvent(eventId);
                  const isEditing = editingEventId === eventId;
                  const hasOverride = perEventPartner.has(eventId) || perEventRole.has(eventId);

                  return (
                    <div key={eventId} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <span className="text-sm font-medium">{event.name}</span>
                          <div className="flex gap-1 mt-0.5">
                            <Badge variant="secondary" className="text-xs capitalize">
                              {event.style}
                            </Badge>
                            <Badge variant="secondary" className="text-xs capitalize">
                              {event.level}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {partner && (
                            <span className="text-xs text-muted-foreground">
                              {role === "leader" ? "Lead" : "Follow"} w/ {partner.displayName ?? partner.username}
                            </span>
                          )}
                          {!partner && (
                            <span className="text-xs text-destructive">No partner</span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0"
                            onClick={() =>
                              setEditingEventId(isEditing ? null : eventId)
                            }
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="space-y-3 pt-2 border-t">
                          <div className="flex gap-2">
                            <Button
                              variant={role === "leader" ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                const next = new Map(perEventRole);
                                next.set(eventId, "leader");
                                setPerEventRole(next);
                              }}
                            >
                              Leader
                            </Button>
                            <Button
                              variant={role === "follower" ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                const next = new Map(perEventRole);
                                next.set(eventId, "follower");
                                setPerEventRole(next);
                              }}
                            >
                              Follower
                            </Button>
                          </div>
                          <PartnerSearch
                            competitionId={comp.id}
                            onSelect={(p) => {
                              const next = new Map(perEventPartner);
                              next.set(eventId, p);
                              setPerEventPartner(next);
                              setEditingEventId(null);
                            }}
                            excludeUserIds={myReg ? [myReg.userId] : []}
                            placeholder="Override partner for this event..."
                          />
                          {hasOverride && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs"
                              onClick={() => {
                                const nextP = new Map(perEventPartner);
                                const nextR = new Map(perEventRole);
                                nextP.delete(eventId);
                                nextR.delete(eventId);
                                setPerEventPartner(nextP);
                                setPerEventRole(nextR);
                                setEditingEventId(null);
                              }}
                            >
                              Reset to default
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setCurrentStep(1)}>
                <ArrowLeft className="size-4 mr-1" />
                Back
              </Button>
              <Button disabled={!allEventsAssigned} onClick={() => setCurrentStep(3)}>
                Next
                <ArrowRight className="size-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review & Submit */}
      {effectiveStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Submit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Review your entries before submitting. {entryAssignments.length} event
              {entryAssignments.length !== 1 ? "s" : ""} selected.
            </p>

            <div className="space-y-2">
              {entryAssignments.map((a) => {
                const event = events?.find((e) => e.id === a.eventId);
                if (!event) return null;
                const role = getRoleForEvent(a.eventId);
                return (
                  <div
                    key={a.eventId}
                    className="flex items-center justify-between p-3 rounded-md border"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{event.name}</span>
                      <div className="flex gap-1 mt-0.5">
                        <Badge variant="secondary" className="text-xs capitalize">
                          {event.style}
                        </Badge>
                        <Badge variant="secondary" className="text-xs capitalize">
                          {event.level}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="outline" className="text-xs capitalize">
                        {role}
                      </Badge>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        w/ {a.partner.displayName ?? a.partner.username}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setCurrentStep(2)}>
                <ArrowLeft className="size-4 mr-1" />
                Back
              </Button>
              <Button
                onClick={handleSubmitEntries}
                disabled={
                  bulkCreateEntries.isPending || ensurePartnerMutation.isPending
                }
              >
                {bulkCreateEntries.isPending || ensurePartnerMutation.isPending
                  ? "Submitting..."
                  : `Submit ${entryAssignments.length} Entries`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function RegistrationInfoCard({ reg }: { reg: MyRegistration }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your Registration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          <Badge variant={reg.cancelled ? "destructive" : "secondary"}>
            {reg.cancelled ? "Cancelled" : reg.checkedIn ? "Checked In" : "Registered"}
          </Badge>
        </div>
        {reg.competitorNumber && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Number</span>
            <span className="font-mono font-bold">{reg.competitorNumber}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Entries</span>
          <span>{reg.entries?.length ?? 0}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentCard({ reg }: { reg: MyRegistration }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payment</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Amount Owed</span>
          <span className="font-medium">${reg.amountOwed ?? "0.00"}</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-sm text-muted-foreground">Total Paid</span>
          <span className="font-medium">${reg.totalPaid ?? "0.00"}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function EntriesList({
  entries,
  myRegId,
  canRemove,
  onRemove,
  onPartnerClick,
}: {
  entries: MyRegistrationEntry[];
  myRegId: number;
  canRemove: boolean;
  onRemove: (entryId: number) => void;
  onPartnerClick: (registrationId: number) => void;
}) {
  if (!entries.length) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No entries yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        // Determine which side is "me" and which is the partner
        const isLeader = entry.leaderRegistrationId === myRegId;
        const partnerName = isLeader ? entry.followerDisplayName : entry.leaderDisplayName;
        const partnerUsername = isLeader ? entry.followerUsername : entry.leaderUsername;
        const partnerRegId = isLeader
          ? entry.followerRegistrationId
          : entry.leaderRegistrationId;
        const myRole = isLeader ? "Leader" : "Follower";

        return (
          <div
            key={entry.id}
            className="flex items-center justify-between p-3 rounded-md border"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {entry.eventName ?? `Event #${entry.eventId}`}
                </span>
                {entry.scratched && (
                  <Badge variant="destructive" className="text-xs">
                    Scratched
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {myRole}
                </Badge>
                {entry.eventStyle && (
                  <Badge variant="secondary" className="text-xs capitalize">
                    {entry.eventStyle}
                  </Badge>
                )}
                {entry.eventLevel && (
                  <Badge variant="secondary" className="text-xs capitalize">
                    {entry.eventLevel}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                w/{" "}
                <button
                  type="button"
                  className="underline hover:text-foreground transition-colors"
                  onClick={() => onPartnerClick(partnerRegId)}
                >
                  {partnerName ?? partnerUsername ?? "Unknown"}
                </button>
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              {canRemove && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => onRemove(entry.id)}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
