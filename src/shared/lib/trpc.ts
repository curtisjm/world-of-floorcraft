import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../auth/routers";

export const trpc = createTRPCReact<AppRouter>();
