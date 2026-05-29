"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Textarea } from "@shared/ui/textarea";
import { Label } from "@shared/ui/label";
import { Separator } from "@shared/ui/separator";
import { Card, CardContent } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { toast } from "sonner";

// ── General info form ───────────────────────────────────────────

const generalSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().optional(),
  rules: z.string().optional(),
});

type GeneralFormData = z.infer<typeof generalSchema>;

// ── Venue form ──────────────────────────────────────────────────

const venueSchema = z.object({
  venueName: z.string().optional(),
  streetAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  venueNotes: z.string().optional(),
});

type VenueFormData = z.infer<typeof venueSchema>;

// ── Scoring settings form ───────────────────────────────────────

const scoringSchema = z.object({
  maxFinalSize: z.coerce.number().min(1).nullable(),
  maxHeatSize: z.coerce.number().min(1).nullable(),
  minutesPerCouplePerDance: z.string().optional(),
  transitionMinutes: z.string().optional(),
});

type ScoringFormData = z.infer<typeof scoringSchema>;

// ── Pricing form ────────────────────────────────────────────────

const pricingSchema = z.object({
  baseFee: z.string().optional(),
  numberStart: z.coerce.number().min(1),
});

type PricingFormData = z.infer<typeof pricingSchema>;

export default function SettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const comp = useQuery(api.competitions.core.getBySlug, { slug, includeArchived: true });
  const isLoading = comp === undefined;

  const updateMutation = useMutation(api.competitions.core.update);
  const archiveMutation = useMutation(api.competitions.core.archive);
  const deleteMutation = useMutation(api.competitions.core.remove);
  const compCodeMutation = useMutation(api.competitions.core.setCompCode);
  const masterPasswordMutation = useMutation(api.competitions.core.setMasterPassword);

  const [updatePending, setUpdatePending] = useState(false);
  const [archivePending, setArchivePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [compCodePending, setCompCodePending] = useState(false);
  const [masterPasswordPending, setMasterPasswordPending] = useState(false);

  // ── General info ──────────────────────────────────────────────

  const generalForm = useForm<GeneralFormData>({
    resolver: zodResolver(generalSchema),
    defaultValues: { name: "", description: "", rules: "" },
  });

  useEffect(() => {
    if (comp) {
      generalForm.reset({
        name: comp.name,
        description: comp.description ?? "",
        rules: comp.rules ?? "",
      });
    }
  }, [comp]); // eslint-disable-line react-hooks/exhaustive-deps

  const onGeneralSubmit = async (data: GeneralFormData) => {
    if (!comp) return;
    setUpdatePending(true);
    try {
      await updateMutation({
        competitionId: comp._id,
        name: data.name,
        description: data.description || null,
        rules: data.rules || null,
      });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setUpdatePending(false);
    }
  };

  // ── Venue ─────────────────────────────────────────────────────

  const venueForm = useForm<VenueFormData>({
    resolver: zodResolver(venueSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (comp) {
      venueForm.reset({
        venueName: comp.venueName ?? "",
        streetAddress: comp.streetAddress ?? "",
        city: comp.city ?? "",
        state: comp.state ?? "",
        zip: comp.zip ?? "",
        country: comp.country ?? "",
        venueNotes: comp.venueNotes ?? "",
      });
    }
  }, [comp]); // eslint-disable-line react-hooks/exhaustive-deps

  const onVenueSubmit = async (data: VenueFormData) => {
    if (!comp) return;
    setUpdatePending(true);
    try {
      await updateMutation({
        competitionId: comp._id,
        venueName: data.venueName || null,
        streetAddress: data.streetAddress || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        country: data.country || null,
        venueNotes: data.venueNotes || null,
      });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setUpdatePending(false);
    }
  };

  // ── Scoring ───────────────────────────────────────────────────

  const scoringForm = useForm<ScoringFormData>({
    resolver: zodResolver(scoringSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (comp) {
      scoringForm.reset({
        maxFinalSize: comp.maxFinalSize ?? null,
        maxHeatSize: comp.maxHeatSize ?? null,
        minutesPerCouplePerDance:
          comp.minutesPerCouplePerDance != null
            ? String(comp.minutesPerCouplePerDance)
            : "1.5",
        transitionMinutes:
          comp.transitionMinutes != null
            ? String(comp.transitionMinutes)
            : "2.0",
      });
    }
  }, [comp]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScoringSubmit = async (data: ScoringFormData) => {
    if (!comp) return;
    setUpdatePending(true);
    try {
      await updateMutation({
        competitionId: comp._id,
        maxFinalSize: data.maxFinalSize,
        maxHeatSize: data.maxHeatSize,
        minutesPerCouplePerDance:
          data.minutesPerCouplePerDance && data.minutesPerCouplePerDance.length > 0
            ? Number(data.minutesPerCouplePerDance)
            : undefined,
        transitionMinutes:
          data.transitionMinutes && data.transitionMinutes.length > 0
            ? Number(data.transitionMinutes)
            : undefined,
      });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setUpdatePending(false);
    }
  };

  // ── Pricing & Numbers ─────────────────────────────────────────

  const pricingForm = useForm<PricingFormData>({
    resolver: zodResolver(pricingSchema),
    defaultValues: { baseFee: "0", numberStart: 1 },
  });

  useEffect(() => {
    if (comp) {
      pricingForm.reset({
        baseFee:
          comp.baseFee != null ? (comp.baseFee / 100).toFixed(2) : "0",
        numberStart: comp.numberStart ?? 1,
      });
    }
  }, [comp]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPricingSubmit = async (data: PricingFormData) => {
    if (!comp) return;
    setUpdatePending(true);
    try {
      await updateMutation({
        competitionId: comp._id,
        baseFee:
          data.baseFee && data.baseFee.length > 0
            ? Math.round(Number(data.baseFee) * 100)
            : null,
        numberStart: data.numberStart,
      });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setUpdatePending(false);
    }
  };

  // ── Tablet Auth ───────────────────────────────────────────────

  const [compCode, setCompCode] = useState("");
  const [masterPassword, setMasterPassword] = useState("");

  useEffect(() => {
    if (comp) setCompCode(comp.compCode ?? "");
  }, [comp]);

  const handleSetCompCode = async () => {
    if (!comp) return;
    setCompCodePending(true);
    try {
      await compCodeMutation({
        competitionId: comp._id,
        compCode,
      });
      toast.success("Competition code saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setCompCodePending(false);
    }
  };

  const handleSetMasterPassword = async () => {
    if (!comp) return;
    setMasterPasswordPending(true);
    try {
      await masterPasswordMutation({
        competitionId: comp._id,
        password: masterPassword,
      });
      toast.success("Master password updated");
      setMasterPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setMasterPasswordPending(false);
    }
  };

  const handleArchive = async () => {
    if (!comp || comp.status === "archived") return;
    if (!confirm(`Archive "${comp.name}"? It will disappear from public competition pages but remain available here.`)) return;
    setArchivePending(true);
    try {
      await archiveMutation({ competitionId: comp._id });
      toast.success("Competition archived");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setArchivePending(false);
    }
  };

  const handleDelete = async () => {
    if (!comp) return;
    if (!confirm(`Delete "${comp.name}"? Only setup-only competitions can be hard-deleted.`)) return;
    setDeletePending(true);
    try {
      await deleteMutation({ competitionId: comp._id });
      toast.success("Competition deleted");
      router.push("/competitions");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setDeletePending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!comp) return null;

  return (
    <div className="space-y-8 max-w-2xl">
      {/* General Info */}
      <section>
        <h2 className="text-lg font-semibold mb-4">General Information</h2>
        <form onSubmit={generalForm.handleSubmit(onGeneralSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Competition Name</Label>
            <Input id="name" {...generalForm.register("name")} />
            {generalForm.formState.errors.name && (
              <p className="text-sm text-destructive">{generalForm.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={4} {...generalForm.register("description")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rules">Rules</Label>
            <Textarea id="rules" rows={6} {...generalForm.register("rules")} />
          </div>
          <Button type="submit" disabled={updatePending}>
            {updatePending ? "Saving..." : "Save"}
          </Button>
        </form>
      </section>

      <Separator />

      {/* Venue */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Venue</h2>
        <form onSubmit={venueForm.handleSubmit(onVenueSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="venueName">Venue Name</Label>
            <Input id="venueName" {...venueForm.register("venueName")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="streetAddress">Street Address</Label>
            <Input id="streetAddress" {...venueForm.register("streetAddress")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" {...venueForm.register("city")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input id="state" {...venueForm.register("state")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="zip">ZIP Code</Label>
              <Input id="zip" {...venueForm.register("zip")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input id="country" {...venueForm.register("country")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="venueNotes">Venue Notes</Label>
            <Textarea
              id="venueNotes"
              rows={3}
              placeholder="Parking info, directions, etc."
              {...venueForm.register("venueNotes")}
            />
          </div>
          <Button type="submit" disabled={updatePending}>
            {updatePending ? "Saving..." : "Save Venue"}
          </Button>
        </form>
      </section>

      <Separator />

      {/* Scoring Settings */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Scoring & Rounds</h2>
        <form onSubmit={scoringForm.handleSubmit(onScoringSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maxFinalSize">Max Final Size</Label>
              <Input
                id="maxFinalSize"
                type="number"
                min={1}
                placeholder="8"
                {...scoringForm.register("maxFinalSize")}
              />
              <p className="text-xs text-muted-foreground">Default: 8 couples</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxHeatSize">Max Heat Size</Label>
              <Input
                id="maxHeatSize"
                type="number"
                min={1}
                placeholder="12"
                {...scoringForm.register("maxHeatSize")}
              />
              <p className="text-xs text-muted-foreground">Default: no limit</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minutesPerCouplePerDance">Minutes per Couple per Dance</Label>
              <Input
                id="minutesPerCouplePerDance"
                placeholder="1.5"
                {...scoringForm.register("minutesPerCouplePerDance")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transitionMinutes">Transition Minutes</Label>
              <Input
                id="transitionMinutes"
                placeholder="2.0"
                {...scoringForm.register("transitionMinutes")}
              />
            </div>
          </div>
          <Button type="submit" disabled={updatePending}>
            {updatePending ? "Saving..." : "Save Scoring Settings"}
          </Button>
        </form>
      </section>

      <Separator />

      {/* Pricing & Numbers */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Pricing & Numbers</h2>
        <form onSubmit={pricingForm.handleSubmit(onPricingSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="baseFee">Base Entry Fee ($)</Label>
              <Input
                id="baseFee"
                placeholder="0.00"
                {...pricingForm.register("baseFee")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="numberStart">Starting Number</Label>
              <Input
                id="numberStart"
                type="number"
                min={1}
                {...pricingForm.register("numberStart")}
              />
            </div>
          </div>
          <Button type="submit" disabled={updatePending}>
            {updatePending ? "Saving..." : "Save"}
          </Button>
        </form>
      </section>

      <Separator />

      {/* Tablet Auth */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Tablet Authentication</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Judges use the competition code and master password to access the marking interface on their tablets.
        </p>
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="compCode">Competition Code</Label>
              <Input
                id="compCode"
                value={compCode}
                onChange={(e) => setCompCode(e.target.value)}
                placeholder="e.g. FALL2026"
                maxLength={20}
              />
            </div>
            <Button
              onClick={handleSetCompCode}
              disabled={compCodePending || !compCode.trim()}
            >
              {compCodePending ? "Saving..." : "Save Code"}
            </Button>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="masterPassword">Master Password</Label>
              <Input
                id="masterPassword"
                type="password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder="Set new password"
              />
            </div>
            <Button
              onClick={handleSetMasterPassword}
              disabled={masterPasswordPending || masterPassword.length < 4}
            >
              {masterPasswordPending ? "Saving..." : "Set Password"}
            </Button>
          </div>
        </div>
      </section>

      <Separator />

      {/* Danger Zone */}
      <section>
        <h2 className="text-lg font-semibold text-destructive mb-4">Danger Zone</h2>
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 flex items-center justify-between">
              <div>
                <p className="font-medium">Archive Competition</p>
                <p className="text-sm text-muted-foreground">
                  Hide this competition from public pages while keeping it available in the organizer dashboard.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleArchive}
                disabled={archivePending || comp.status === "archived"}
              >
                {comp.status === "archived"
                  ? "Archived"
                  : archivePending
                    ? "Archiving..."
                    : "Archive"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-destructive/50">
            <CardContent className="pt-6 flex items-center justify-between">
              <div>
                <p className="font-medium">Delete Competition</p>
                <p className="text-sm text-muted-foreground">
                  Permanently delete setup-only competitions. Competitions with registrations, scoring, payments, or other user data must be archived instead.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deletePending}
              >
                {deletePending ? "Deleting..." : "Delete"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
