"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@shared/ui/card";

const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

export default function OnboardingPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.profile.needsOnboarding.useQuery();

  const updateProfile = trpc.profile.update.useMutation({
    onSuccess: () => {
      utils.profile.needsOnboarding.invalidate();
      router.push("/");
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  // If the user already has a username, redirect them away
  if (!isLoading && data && !data.needsOnboarding) {
    router.push("/");
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = username.trim();

    if (trimmed.length < 3 || trimmed.length > 20) {
      setError("Username must be between 3 and 20 characters.");
      return;
    }

    if (!USERNAME_REGEX.test(trimmed)) {
      setError("Username can only contain letters, numbers, and underscores.");
      return;
    }

    updateProfile.mutate({
      username: trimmed,
      ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-73px)]">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-73px)] px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to World of Floorcraft</CardTitle>
          <CardDescription>
            Choose a username to get started. This is how other dancers will find
            you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">
                Username <span className="text-destructive">*</span>
              </Label>
              <Input
                id="username"
                placeholder="e.g. dancequeen42"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={20}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                3-20 characters. Letters, numbers, and underscores only.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                placeholder="e.g. Jane Smith"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={60}
              />
              <p className="text-xs text-muted-foreground">
                Optional. Your name as shown on your profile.
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={updateProfile.isPending}
            >
              {updateProfile.isPending ? "Saving..." : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
