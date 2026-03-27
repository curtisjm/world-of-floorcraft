"use client";

import { useState, useEffect } from "react";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
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

export function ProfileSettings() {
  const utils = trpc.useUtils();
  const { data: me, isLoading } = trpc.profile.me.useQuery();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [competitionLevel, setCompetitionLevel] = useState<CompetitionLevel | "">("");
  const [competitionLevelHigh, setCompetitionLevelHigh] = useState<CompetitionLevel | "">("");
  const [showConsecutiveLevel, setShowConsecutiveLevel] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

  const handleSubmit = (e: React.FormEvent) => {
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

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {success && (
        <p className="text-sm text-green-500">Profile updated successfully.</p>
      )}

      <Button type="submit" disabled={updateMutation.isPending} className="w-fit">
        {updateMutation.isPending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
