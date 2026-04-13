"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@shared/ui/card";
import { Building2, CheckCircle, XCircle } from "lucide-react";

export default function InviteTokenPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "accepted" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const acceptMutation = trpc.invite.accept.useMutation({
    onSuccess: () => {
      setStatus("accepted");
    },
    onError: (err) => {
      setStatus("error");
      setErrorMessage(err.message);
    },
  });

  const handleAccept = () => {
    acceptMutation.mutate({ token });
  };

  if (status === "accepted") {
    return (
      <div className="max-w-md mx-auto px-6 py-16">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <CheckCircle className="h-12 w-12 text-emerald-500" />
            <h2 className="text-xl font-semibold">You&apos;re in!</h2>
            <p className="text-sm text-muted-foreground">
              You&apos;ve successfully joined the organization.
            </p>
            <Button onClick={() => router.push("/orgs")} className="mt-2">
              View Organizations
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="max-w-md mx-auto px-6 py-16">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <XCircle className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-semibold">Unable to join</h2>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <Button
              variant="outline"
              onClick={() => router.push("/orgs")}
              className="mt-2"
            >
              Browse Organizations
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Building2 className="h-10 w-10 text-indigo-400" />
          </div>
          <CardTitle>Organization Invite</CardTitle>
          <CardDescription>
            You&apos;ve been invited to join an organization. Click below to
            accept.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center gap-3 pb-8">
          <Button onClick={handleAccept} disabled={acceptMutation.isPending}>
            {acceptMutation.isPending ? "Joining..." : "Accept Invite"}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/orgs")}
            disabled={acceptMutation.isPending}
          >
            Decline
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
