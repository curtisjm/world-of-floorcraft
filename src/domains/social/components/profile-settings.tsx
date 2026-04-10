"use client";

import { useState, useEffect } from "react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Switch } from "@shared/ui/switch";
import { trpc } from "@shared/lib/trpc";

const COMPETITION_LEVELS = [
  { value: "newcomer", label: "Newcomer" },
  { value: "bronze", label: "Bronze" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
  { value: "novice", label: "Novice" },
  { value: "prechamp", label: "Pre-Champ" },
  { value: "champ", label: "Champ" },
  { value: "professional", label: "Professional" },
] as const;

type CompetitionLevel = (typeof COMPETITION_LEVELS)[number]["value"];

const DANCE_STYLES = [
  { value: "standard", label: "Standard" },
  { value: "smooth", label: "Smooth" },
  { value: "latin", label: "Latin" },
  { value: "rhythm", label: "Rhythm" },
  { value: "nightclub", label: "Nightclub" },
] as const;

type DanceStyle = (typeof DANCE_STYLES)[number]["value"];

const ROLE_PREFERENCES = [
  { value: "lead", label: "Lead" },
  { value: "follow", label: "Follow" },
  { value: "both", label: "Both" },
] as const;

type RolePreference = (typeof ROLE_PREFERENCES)[number]["value"];

export function ProfileSettings() {
  const utils = trpc.useUtils();
  const { data: me, isLoading } = trpc.profile.me.useQuery();
  const { data: partnerSearch } = trpc.partnerSearch.me.useQuery();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [competitionLevel, setCompetitionLevel] = useState<CompetitionLevel | "">("");
  const [competitionLevelHigh, setCompetitionLevelHigh] = useState<CompetitionLevel | "">("");
  const [showConsecutiveLevel, setShowConsecutiveLevel] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Partner search state
  const [lookingForPartner, setLookingForPartner] = useState(false);
  const [partnerStyles, setPartnerStyles] = useState<DanceStyle[]>([]);
  const [partnerHeight, setPartnerHeight] = useState("");
  const [partnerLocation, setPartnerLocation] = useState("");
  const [partnerBio, setPartnerBio] = useState("");
  const [partnerRole, setPartnerRole] = useState<RolePreference | "">("");

  useEffect(() => {
    if (me) {
      setUsername(me.username ?? "");
      setDisplayName(me.displayName ?? "");
      setBio(me.bio ?? "");
      setCompetitionLevel((me.competitionLevel as CompetitionLevel | null) ?? "");
      setCompetitionLevelHigh((me.competitionLevelHigh as CompetitionLevel | null) ?? "");
      setShowConsecutiveLevel(!!me.competitionLevelHigh);
      setIsPrivate(me.isPrivate);
    }
  }, [me]);

  useEffect(() => {
    if (partnerSearch) {
      setLookingForPartner(true);
      setPartnerStyles((partnerSearch.danceStyles ?? []) as DanceStyle[]);
      setPartnerHeight(partnerSearch.height ?? "");
      setPartnerLocation(partnerSearch.location ?? "");
      setPartnerBio(partnerSearch.bio ?? "");
      setPartnerRole((partnerSearch.rolePreference as RolePreference) ?? "");
    } else {
      setLookingForPartner(false);
    }
  }, [partnerSearch]);

  const updateMutation = trpc.profile.update.useMutation({
    onSuccess: () => {
      utils.profile.me.invalidate();
      setSuccess(true);
      setError(null);
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (err) => {
      setError(err.message);
      setSuccess(false);
    },
  });

  const upsertPartnerSearch = trpc.partnerSearch.upsert.useMutation({
    onSuccess: () => {
      utils.partnerSearch.me.invalidate();
    },
    onError: (err) => {
      setError(err.message);
      setSuccess(false);
    },
  });

  const removePartnerSearch = trpc.partnerSearch.remove.useMutation({
    onSuccess: () => {
      utils.partnerSearch.me.invalidate();
      setPartnerStyles([]);
      setPartnerHeight("");
      setPartnerLocation("");
      setPartnerBio("");
      setPartnerRole("");
    },
    onError: (err) => {
      setError(err.message);
      setSuccess(false);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    updateMutation.mutate({
      username: username || undefined,
      displayName: displayName || undefined,
      bio: bio || undefined,
      competitionLevel: (competitionLevel as CompetitionLevel) || null,
      competitionLevelHigh: showConsecutiveLevel && competitionLevel !== "professional"
        ? (competitionLevelHigh as CompetitionLevel) || null
        : null,
      isPrivate,
    });

    // Handle partner search: upsert if enabled, remove if disabled
    if (lookingForPartner && partnerStyles.length > 0 && partnerRole) {
      upsertPartnerSearch.mutate({
        danceStyles: partnerStyles,
        height: partnerHeight || undefined,
        location: partnerLocation || undefined,
        bio: partnerBio || undefined,
        rolePreference: partnerRole,
      });
    } else if (!lookingForPartner && partnerSearch) {
      removePartnerSearch.mutate();
    }
  };

  if (isLoading) {
    return <div className="text-muted-foreground text-sm">Loading...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="username">
          Username
        </label>
        <Input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          maxLength={30}
        />
        <p className="text-xs text-muted-foreground">Only letters, numbers, and underscores. 3–30 characters.</p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="displayName">
          Display name
        </label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          maxLength={60}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="bio">
          Bio
        </label>
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell us about yourself..."
          maxLength={500}
          rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
        />
        <p className="text-xs text-muted-foreground">{bio.length}/500</p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="competitionLevel">
          Competition level
        </label>
        <select
          id="competitionLevel"
          value={competitionLevel}
          onChange={(e) => {
            setCompetitionLevel(e.target.value as CompetitionLevel | "");
            if (e.target.value === "professional") {
              setShowConsecutiveLevel(false);
              setCompetitionLevelHigh("");
            }
          }}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">— None —</option>
          {COMPETITION_LEVELS.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label}
            </option>
          ))}
        </select>
      </div>

      {competitionLevel && competitionLevel !== "professional" && (
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showConsecutiveLevel}
              onChange={(e) => {
                setShowConsecutiveLevel(e.target.checked);
                if (!e.target.checked) setCompetitionLevelHigh("");
              }}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium">Set consecutive upper level</span>
          </label>

          {showConsecutiveLevel && (
            <div className="flex flex-col gap-2 ml-6">
              <label className="text-sm font-medium" htmlFor="competitionLevelHigh">
                Upper level
              </label>
              <select
                id="competitionLevelHigh"
                value={competitionLevelHigh}
                onChange={(e) => setCompetitionLevelHigh(e.target.value as CompetitionLevel | "")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">— None —</option>
                {COMPETITION_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            role="switch"
            aria-checked={isPrivate}
            onClick={() => setIsPrivate(!isPrivate)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer ${
              isPrivate ? "bg-primary" : "bg-input"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                isPrivate ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </div>
          <div>
            <p className="text-sm font-medium">Private account</p>
            <p className="text-xs text-muted-foreground">Only approved followers can see your posts and routines.</p>
          </div>
        </label>
      </div>

      <div className="border-t pt-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Looking for a partner</p>
            <p className="text-xs text-muted-foreground">Show others that you&apos;re searching for a dance partner.</p>
          </div>
          <Switch
            checked={lookingForPartner}
            onCheckedChange={setLookingForPartner}
          />
        </div>

        {lookingForPartner && (
          <div className="flex flex-col gap-4 ml-1 pl-4 border-l-2 border-primary/20">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Dance style(s)</label>
              <div className="flex flex-wrap gap-2">
                {DANCE_STYLES.map((style) => (
                  <button
                    key={style.value}
                    type="button"
                    onClick={() => {
                      setPartnerStyles((prev) =>
                        prev.includes(style.value)
                          ? prev.filter((s) => s !== style.value)
                          : [...prev, style.value]
                      );
                    }}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      partnerStyles.includes(style.value)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-input hover:bg-muted"
                    }`}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
              {partnerStyles.length === 0 && (
                <p className="text-xs text-destructive">Select at least one style.</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="partnerRole">
                Role preference
              </label>
              <select
                id="partnerRole"
                value={partnerRole}
                onChange={(e) => setPartnerRole(e.target.value as RolePreference | "")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">— Select —</option>
                {ROLE_PREFERENCES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="partnerHeight">
                Height
              </label>
              <Input
                id="partnerHeight"
                value={partnerHeight}
                onChange={(e) => setPartnerHeight(e.target.value)}
                placeholder={"e.g. 5'8\" or 173cm"}
                maxLength={30}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="partnerLocation">
                Location
              </label>
              <Input
                id="partnerLocation"
                value={partnerLocation}
                onChange={(e) => setPartnerLocation(e.target.value)}
                placeholder="e.g. New York, NY"
                maxLength={100}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="partnerBio">
                Partner search bio
              </label>
              <textarea
                id="partnerBio"
                value={partnerBio}
                onChange={(e) => setPartnerBio(e.target.value)}
                placeholder="What are you looking for in a partner? Experience, goals, availability..."
                maxLength={500}
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
              <p className="text-xs text-muted-foreground">{partnerBio.length}/500</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {success && (
        <p className="text-sm text-green-500">Profile updated successfully.</p>
      )}

      <Button
        type="submit"
        disabled={updateMutation.isPending || upsertPartnerSearch.isPending || removePartnerSearch.isPending}
        className="w-fit"
      >
        {updateMutation.isPending || upsertPartnerSearch.isPending || removePartnerSearch.isPending
          ? "Saving..."
          : "Save changes"}
      </Button>
    </form>
  );
}
