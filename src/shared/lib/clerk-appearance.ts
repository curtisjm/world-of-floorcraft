import type { Appearance } from "@clerk/ui";
import { shadcn } from "@clerk/ui/themes";

export const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  variables: {
    colorBackground: "var(--card)",
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorNeutral: "var(--muted)",
    borderRadius: "var(--radius)",
    fontFamily: "var(--font-body), sans-serif",
  },
} satisfies Appearance;
