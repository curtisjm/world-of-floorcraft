import { z } from "zod";
import { eq, or } from "drizzle-orm";
import { publicProcedure, router } from "../../shared/auth/trpc";
import { db } from "../../shared/db";
import { figures, figureEdges } from "../schema";

export const figureRouter = router({
  list: publicProcedure
    .input(z.object({ danceId: z.number() }).optional())
    .query(async ({ input }) => {
      if (input?.danceId) {
        return db
          .select()
          .from(figures)
          .where(eq(figures.danceId, input.danceId));
      }
      return db.select().from(figures);
    }),

  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [figure] = await db
        .select()
        .from(figures)
        .where(eq(figures.id, input.id));
      return figure ?? null;
    }),

  neighbors: publicProcedure
    .input(z.object({ figureId: z.number() }))
    .query(async ({ input }) => {
      const edges = await db
        .select()
        .from(figureEdges)
        .where(
          or(
            eq(figureEdges.sourceFigureId, input.figureId),
            eq(figureEdges.targetFigureId, input.figureId)
          )
        );

      const precedes = edges.filter(
        (e) => e.targetFigureId === input.figureId
      );
      const follows = edges.filter(
        (e) => e.sourceFigureId === input.figureId
      );

      return { precedes, follows };
    }),
});
