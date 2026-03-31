"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { trpc } from "@shared/lib/trpc";

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn, isLoaded } = useAuth();

  const { data, isLoading } = trpc.profile.needsOnboarding.useQuery(
    undefined,
    { enabled: isLoaded && !!isSignedIn }
  );

  useEffect(() => {
    if (
      !isLoading &&
      data?.needsOnboarding &&
      pathname !== "/onboarding"
    ) {
      router.push("/onboarding");
    }
  }, [isLoading, data, pathname, router]);

  return <>{children}</>;
}
