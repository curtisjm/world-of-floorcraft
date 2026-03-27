import { router } from "./trpc";
import { danceRouter } from "../../domains/syllabus/routers/dance";
import { figureRouter } from "../../domains/syllabus/routers/figure";
import { routineRouter } from "../../domains/routines/routers/routine";

export const appRouter = router({
  dance: danceRouter,
  figure: figureRouter,
  routine: routineRouter,
});

export type AppRouter = typeof appRouter;
