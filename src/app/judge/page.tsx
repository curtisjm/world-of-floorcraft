"use client";

import { useState, useEffect, useCallback } from "react";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Skeleton } from "@shared/ui/skeleton";
import { toast } from "sonner";
import {
  LogOut,
  Check,
  X,
  Send,
  Edit3,
  Loader2,
  Gavel,
  AlertTriangle,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────

interface ActiveRound {
  roundId: number;
  eventName: string;
  eventStyle?: string | null;
  roundType: string;
  callbacksRequested: number | null;
  dances: string[];
  couples: Array<{
    entryId: number;
    competitorNumber: number | null;
    heatNumber: number | null;
  }>;
  submissionStatus: string;
  isFinal: boolean;
}

// ── Main Page ───────────────────────────────────────────────────────

export default function JudgePage() {
  const [token, setToken] = useState<string | null>(null);
  const [judgeName, setJudgeName] = useState("");
  const [compName, setCompName] = useState("");

  // Persist token across page refreshes
  useEffect(() => {
    const saved = localStorage.getItem("judge_token");
    if (saved) {
      setToken(saved);
      setJudgeName(localStorage.getItem("judge_name") ?? "");
      setCompName(localStorage.getItem("judge_comp") ?? "");
    }
  }, []);

  function handleAuth(result: { token: string; judgeName: string; competitionName: string }) {
    setToken(result.token);
    setJudgeName(result.judgeName);
    setCompName(result.competitionName);
    localStorage.setItem("judge_token", result.token);
    localStorage.setItem("judge_name", result.judgeName);
    localStorage.setItem("judge_comp", result.competitionName);
  }

  function handleLogout() {
    setToken(null);
    setJudgeName("");
    setCompName("");
    localStorage.removeItem("judge_token");
    localStorage.removeItem("judge_name");
    localStorage.removeItem("judge_comp");
  }

  if (!token) {
    return <AuthScreen onAuth={handleAuth} />;
  }

  return (
    <JudgeView
      token={token}
      judgeName={judgeName}
      compName={compName}
      onLogout={handleLogout}
    />
  );
}

// ── Auth Screen ─────────────────────────────────────────────────────

function AuthScreen({
  onAuth,
}: {
  onAuth: (result: { token: string; judgeName: string; competitionName: string }) => void;
}) {
  const [compCode, setCompCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"credentials" | "judge-select">("credentials");
  const [compData, setCompData] = useState<{ compCode: string; password: string } | null>(null);

  // After credentials, we need to show judge selection.
  // Use authenticate with a known judge — but we need to list judges first.
  // The judge list comes from the judge router (public isn't available without comp ID).
  // For now: credentials → judge ID input → authenticate.

  const [judgeId, setJudgeId] = useState("");

  const authMutation = trpc.judgeSession.authenticate.useMutation({
    onSuccess: (data) => {
      toast.success(`Welcome, ${data.judgeName}`);
      onAuth({
        token: data.token,
        judgeName: data.judgeName,
        competitionName: data.competitionName,
      });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Gavel className="size-10 mx-auto mb-2 text-muted-foreground" />
          <CardTitle className="text-xl">Judge Login</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter the competition code and master password
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="compCode">Competition Code</Label>
            <Input
              id="compCode"
              placeholder="e.g. OSB"
              value={compCode}
              onChange={(e) => setCompCode(e.target.value.toUpperCase())}
              maxLength={4}
              className="text-center text-2xl tracking-widest font-mono uppercase"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Master Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="judgeId">Judge Number</Label>
            <Input
              id="judgeId"
              type="number"
              placeholder="Your assigned judge ID"
              value={judgeId}
              onChange={(e) => setJudgeId(e.target.value)}
              className="text-center text-lg"
            />
          </div>
          <Button
            className="w-full"
            size="lg"
            disabled={!compCode || !password || !judgeId || authMutation.isPending}
            onClick={() =>
              authMutation.mutate({
                compCode,
                masterPassword: password,
                judgeId: parseInt(judgeId),
              })
            }
          >
            {authMutation.isPending ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <Gavel className="size-4 mr-2" />
            )}
            Sign In
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Judge View (authenticated) ──────────────────────────────────────

function JudgeView({
  token,
  judgeName,
  compName,
  onLogout,
}: {
  token: string;
  judgeName: string;
  compName: string;
  onLogout: () => void;
}) {
  const { data: activeRound, isLoading, refetch } = trpc.judgeSession.getActiveRound.useQuery(
    { token },
    { refetchInterval: 5000 },
  );

  const logoutMutation = trpc.judgeSession.logout.useMutation({
    onSuccess: () => {
      toast.success("Logged out");
      onLogout();
    },
    onError: () => onLogout(), // Logout anyway
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header bar */}
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <div>
          <p className="font-semibold">{judgeName}</p>
          <p className="text-xs text-muted-foreground">{compName}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => logoutMutation.mutate({ token })}
        >
          <LogOut className="size-4 mr-1" />
          Logout
        </Button>
      </div>

      {/* Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : !activeRound ? (
          <WaitingScreen onRefresh={refetch} />
        ) : activeRound.isFinal ? (
          <FinalMarkingPage token={token} round={activeRound} />
        ) : (
          <CallbackMarkingPage token={token} round={activeRound} />
        )}
      </div>
    </div>
  );
}

// ── Waiting Screen ──────────────────────────────────────────────────

function WaitingScreen({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <Loader2 className="size-12 text-muted-foreground animate-spin" />
      <h2 className="text-xl font-semibold">Waiting for next round...</h2>
      <p className="text-muted-foreground">
        The scrutineer will start the next round shortly.
      </p>
      <Button variant="outline" onClick={onRefresh}>
        Refresh
      </Button>
    </div>
  );
}

// ── Callback Marking Page ───────────────────────────────────────────

function CallbackMarkingPage({
  token,
  round,
}: {
  token: string;
  round: ActiveRound;
}) {
  const [marks, setMarks] = useState<Record<number, "marked" | "maybe" | "unmarked">>({});
  const [submitted, setSubmitted] = useState(round.submissionStatus === "submitted");
  const [editing, setEditing] = useState(false);

  // Load existing marks if re-entering
  const { data: existingSubmission } = trpc.judgeSession.getMySubmission.useQuery(
    { token, roundId: round.roundId },
    { enabled: round.submissionStatus === "submitted" },
  );

  useEffect(() => {
    if (existingSubmission?.type === "callback") {
      const restored: Record<number, "marked" | "maybe" | "unmarked"> = {};
      for (const m of existingSubmission.marks) {
        restored[m.entryId] = m.marked ? "marked" : "unmarked";
      }
      setMarks(restored);
    }
  }, [existingSubmission]);

  // Initialize marks for all couples
  useEffect(() => {
    if (Object.keys(marks).length === 0) {
      const initial: Record<number, "marked" | "maybe" | "unmarked"> = {};
      for (const couple of round.couples) {
        initial[couple.entryId] = "unmarked";
      }
      setMarks(initial);
    }
  }, [round.couples, marks]);

  const toggleMark = (entryId: number) => {
    if (submitted && !editing) return;
    setMarks((prev) => {
      const current = prev[entryId] ?? "unmarked";
      const next =
        current === "unmarked" ? "marked" : current === "marked" ? "maybe" : "unmarked";
      return { ...prev, [entryId]: next };
    });
  };

  const markedCount = Object.values(marks).filter((v) => v === "marked").length;

  const submitMutation = trpc.judgeSession.submitCallbackMarks.useMutation({
    onSuccess: () => {
      toast.success("Marks submitted");
      setSubmitted(true);
      setEditing(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    // Validation: warn if count doesn't match
    if (round.callbacksRequested && markedCount !== round.callbacksRequested) {
      const confirmed = window.confirm(
        `You marked ${markedCount} callbacks but ${round.callbacksRequested} were requested. Submit anyway?`,
      );
      if (!confirmed) return;
    }

    submitMutation.mutate({
      token,
      roundId: round.roundId,
      marks: round.couples.map((c) => ({
        entryId: c.entryId,
        marked: marks[c.entryId] === "marked",
      })),
    });
  };

  // Group by heat
  const heats = new Map<number | null, typeof round.couples>();
  for (const couple of round.couples) {
    const heat = couple.heatNumber;
    if (!heats.has(heat)) heats.set(heat, []);
    heats.get(heat)!.push(couple);
  }

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold">{round.eventName}</h2>
        <p className="text-sm text-muted-foreground capitalize">
          {round.roundType.replace("_", " ")}
          {round.callbacksRequested && ` — ${round.callbacksRequested} callbacks`}
        </p>
        <p className="text-sm font-medium">
          Marked: {markedCount}
          {round.callbacksRequested && ` / ${round.callbacksRequested}`}
        </p>
      </div>

      {/* Couple numbers */}
      <div className="space-y-2">
        {[...heats.entries()].map(([heatNum, couples]) => (
          <div key={heatNum ?? "all"}>
            {heatNum !== null && heats.size > 1 && (
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold py-1 border-b mb-2">
                Heat {heatNum}
              </div>
            )}
            <div className="grid grid-cols-4 gap-2">
              {couples.map((couple) => {
                const state = marks[couple.entryId] ?? "unmarked";
                return (
                  <button
                    key={couple.entryId}
                    onClick={() => toggleMark(couple.entryId)}
                    disabled={submitted && !editing}
                    className={`
                      aspect-square rounded-lg border-2 flex items-center justify-center
                      text-2xl font-bold transition-all select-none
                      ${
                        state === "marked"
                          ? "bg-green-600 border-green-700 text-white"
                          : state === "maybe"
                            ? "bg-yellow-500 border-yellow-600 text-white"
                            : "bg-muted border-border text-foreground hover:bg-accent"
                      }
                      ${submitted && !editing ? "opacity-60" : "active:scale-95"}
                    `}
                  >
                    {couple.competitorNumber ?? couple.entryId}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        {submitted && !editing ? (
          <Button
            className="flex-1"
            size="lg"
            variant="outline"
            onClick={() => setEditing(true)}
          >
            <Edit3 className="size-4 mr-2" />
            Edit Marks
          </Button>
        ) : (
          <Button
            className="flex-1"
            size="lg"
            disabled={submitMutation.isPending}
            onClick={handleSubmit}
          >
            {submitMutation.isPending ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <Send className="size-4 mr-2" />
            )}
            {submitted ? "Re-submit" : "Submit"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Final Marking Page ──────────────────────────────────────────────

function FinalMarkingPage({
  token,
  round,
}: {
  token: string;
  round: ActiveRound;
}) {
  // Rankings: danceName -> entryId -> placement
  const [rankings, setRankings] = useState<Record<string, Record<number, number>>>({});
  const [activeDance, setActiveDance] = useState(round.dances[0] ?? "");
  const [submitted, setSubmitted] = useState(round.submissionStatus === "submitted");
  const [editing, setEditing] = useState(false);

  const couples = round.couples;
  const dances = round.dances;

  // Load existing marks
  const { data: existingSubmission } = trpc.judgeSession.getMySubmission.useQuery(
    { token, roundId: round.roundId },
    { enabled: round.submissionStatus === "submitted" },
  );

  useEffect(() => {
    if (existingSubmission?.type === "final") {
      const restored: Record<string, Record<number, number>> = {};
      for (const m of existingSubmission.marks) {
        if (!restored[m.danceName]) restored[m.danceName] = {};
        restored[m.danceName][m.entryId] = m.placement;
      }
      setRankings(restored);
    }
  }, [existingSubmission]);

  // Initialize rankings
  useEffect(() => {
    if (Object.keys(rankings).length === 0 && dances.length > 0) {
      const initial: Record<string, Record<number, number>> = {};
      for (const dance of dances) {
        initial[dance] = {};
      }
      setRankings(initial);
    }
  }, [dances, rankings]);

  const currentRanking = rankings[activeDance] ?? {};
  const nextPlacement = Object.keys(currentRanking).length + 1;
  const allPlaced = Object.keys(currentRanking).length === couples.length;

  const placeCouple = (entryId: number) => {
    if (submitted && !editing) return;
    if (currentRanking[entryId]) return; // already placed

    setRankings((prev) => ({
      ...prev,
      [activeDance]: {
        ...prev[activeDance],
        [entryId]: nextPlacement,
      },
    }));
  };

  const unplaceCouple = (entryId: number) => {
    if (submitted && !editing) return;
    setRankings((prev) => {
      const dance = { ...prev[activeDance] };
      const removedPlacement = dance[entryId];
      if (!removedPlacement) return prev;

      delete dance[entryId];
      // Re-sequence placements above the removed one
      for (const [eid, p] of Object.entries(dance)) {
        if (p > removedPlacement) {
          dance[parseInt(eid)] = p - 1;
        }
      }
      return { ...prev, [activeDance]: dance };
    });
  };

  const allDancesComplete = dances.every(
    (d) => Object.keys(rankings[d] ?? {}).length === couples.length,
  );

  const submitMutation = trpc.judgeSession.submitFinalMarks.useMutation({
    onSuccess: () => {
      toast.success("Marks submitted");
      setSubmitted(true);
      setEditing(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!allDancesComplete) {
      toast.error("Please rank all couples for all dances");
      return;
    }

    const marks: Array<{ entryId: number; danceName: string; placement: number }> = [];
    for (const dance of dances) {
      const danceRanking = rankings[dance] ?? {};
      for (const [entryId, placement] of Object.entries(danceRanking)) {
        marks.push({
          entryId: parseInt(entryId),
          danceName: dance,
          placement,
        });
      }
    }

    submitMutation.mutate({ token, roundId: round.roundId, marks });
  };

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold">{round.eventName}</h2>
        <p className="text-sm text-muted-foreground">Final — Rank all couples</p>
      </div>

      {/* Dance tabs */}
      {dances.length > 1 && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {dances.map((dance) => {
            const danceComplete =
              Object.keys(rankings[dance] ?? {}).length === couples.length;
            return (
              <Button
                key={dance}
                variant={activeDance === dance ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveDance(dance)}
                className="shrink-0"
              >
                {dance}
                {danceComplete && <Check className="size-3 ml-1" />}
              </Button>
            );
          })}
        </div>
      )}

      {/* Ranking list */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
          Tap a number to rank — next placement: {allPlaced ? "done" : nextPlacement}
        </p>

        {/* Placed couples */}
        {Object.entries(currentRanking)
          .sort(([, a], [, b]) => a - b)
          .map(([entryId, placement]) => {
            const couple = couples.find((c) => c.entryId === parseInt(entryId));
            return (
              <div
                key={entryId}
                onClick={() => unplaceCouple(parseInt(entryId))}
                className="flex items-center gap-3 p-3 rounded-lg border bg-accent/30 cursor-pointer hover:bg-accent/50"
              >
                <span className="text-lg font-bold w-8 text-center">{placement}</span>
                <span className="text-xl font-mono">
                  {couple?.competitorNumber ?? entryId}
                </span>
              </div>
            );
          })}

        {/* Divider */}
        {Object.keys(currentRanking).length > 0 &&
          Object.keys(currentRanking).length < couples.length && (
            <div className="border-t my-2" />
          )}

        {/* Unplaced couples */}
        <div className="grid grid-cols-4 gap-2 pt-1">
          {couples
            .filter((c) => !currentRanking[c.entryId])
            .map((couple) => (
              <button
                key={couple.entryId}
                onClick={() => placeCouple(couple.entryId)}
                disabled={submitted && !editing}
                className={`
                  aspect-square rounded-lg border-2 flex items-center justify-center
                  text-2xl font-bold transition-all select-none
                  bg-muted border-border text-foreground hover:bg-accent
                  ${submitted && !editing ? "opacity-60" : "active:scale-95"}
                `}
              >
                {couple.competitorNumber ?? couple.entryId}
              </button>
            ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        {submitted && !editing ? (
          <Button
            className="flex-1"
            size="lg"
            variant="outline"
            onClick={() => setEditing(true)}
          >
            <Edit3 className="size-4 mr-2" />
            Edit Rankings
          </Button>
        ) : (
          <Button
            className="flex-1"
            size="lg"
            disabled={!allDancesComplete || submitMutation.isPending}
            onClick={handleSubmit}
          >
            {submitMutation.isPending ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <Send className="size-4 mr-2" />
            )}
            {submitted ? "Re-submit" : "Submit Rankings"}
          </Button>
        )}
      </div>
    </div>
  );
}
