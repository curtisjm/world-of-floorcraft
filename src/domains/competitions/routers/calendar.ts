import { z } from "zod";
import { eq, and, asc, inArray } from "drizzle-orm";
import { router, publicProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  competitionDays,
  competitionEvents,
  competitionRegistrations,
} from "@competitions/schema";
import { organizations } from "@orgs/schema";

export const calendarRouter = router({
  // ── Upcoming competitions ───────────────────────────────────────
  getUpcoming: publicProcedure
    .input(
      z.object({
        state: z.string().optional(),
        city: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        style: z.enum(["standard", "smooth", "latin", "rhythm", "nightclub"]).optional(),
      }).default({}),
    )
    .query(async ({ input }) => {
      const filters = input;

      // Get competitions with active statuses
      const activeStatuses = ["advertised", "accepting_entries", "entries_closed", "running"] as const;
      let allComps = await db.query.competitions.findMany({
        where: inArray(competitions.status, activeStatuses),
      });

      // Apply location filters
      if (filters.state) {
        allComps = allComps.filter((c) => c.state?.toLowerCase() === filters.state!.toLowerCase());
      }
      if (filters.city) {
        allComps = allComps.filter((c) => c.city?.toLowerCase().includes(filters.city!.toLowerCase()));
      }

      // Enrich with dates, org, and style info
      const enriched = await Promise.all(
        allComps.map(async (comp) => {
          const org = await db.query.organizations.findFirst({
            where: eq(organizations.id, comp.orgId),
          });

          const days = await db.query.competitionDays.findMany({
            where: eq(competitionDays.competitionId, comp.id),
            orderBy: asc(competitionDays.position),
          });

          const dates = days.map((d) => d.date).sort();
          const startDate = dates[0] ?? null;
          const endDate = dates[dates.length - 1] ?? null;

          // Get distinct styles offered
          const events = await db.query.competitionEvents.findMany({
            where: eq(competitionEvents.competitionId, comp.id),
          });
          const styles = [...new Set(events.map((e) => e.style))];

          // Registration count
          const regs = await db.query.competitionRegistrations.findMany({
            where: and(
              eq(competitionRegistrations.competitionId, comp.id),
              eq(competitionRegistrations.cancelled, false),
            ),
          });

          return {
            id: comp.id,
            name: comp.name,
            slug: comp.slug,
            status: comp.status,
            organizationName: org?.name ?? null,
            city: comp.city,
            state: comp.state,
            startDate,
            endDate,
            styles,
            registrationCount: regs.length,
          };
        }),
      );

      // Apply date filters
      let filtered = enriched;
      if (filters.dateFrom) {
        filtered = filtered.filter((c) => c.startDate && c.startDate >= filters.dateFrom!);
      }
      if (filters.dateTo) {
        filtered = filtered.filter((c) => c.startDate && c.startDate <= filters.dateTo!);
      }
      if (filters.style) {
        filtered = filtered.filter((c) => c.styles.includes(filters.style!));
      }

      // Sort by start date
      filtered.sort((a, b) => {
        if (!a.startDate && !b.startDate) return 0;
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        return a.startDate.localeCompare(b.startDate);
      });

      return filtered;
    }),

  // ── Past competitions (archive) ─────────────────────────────────
  getPast: publicProcedure
    .input(
      z.object({
        state: z.string().optional(),
        city: z.string().optional(),
        year: z.number().optional(),
        style: z.enum(["standard", "smooth", "latin", "rhythm", "nightclub"]).optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }).default({}),
    )
    .query(async ({ input }) => {
      const filters = input;

      let allComps = await db.query.competitions.findMany({
        where: eq(competitions.status, "finished"),
      });

      if (filters.state) {
        allComps = allComps.filter((c) => c.state?.toLowerCase() === filters.state!.toLowerCase());
      }
      if (filters.city) {
        allComps = allComps.filter((c) => c.city?.toLowerCase().includes(filters.city!.toLowerCase()));
      }

      const enriched = await Promise.all(
        allComps.map(async (comp) => {
          const org = await db.query.organizations.findFirst({
            where: eq(organizations.id, comp.orgId),
          });

          const days = await db.query.competitionDays.findMany({
            where: eq(competitionDays.competitionId, comp.id),
            orderBy: asc(competitionDays.position),
          });

          const dates = days.map((d) => d.date).sort();
          const startDate = dates[0] ?? null;

          const events = await db.query.competitionEvents.findMany({
            where: eq(competitionEvents.competitionId, comp.id),
          });
          const styles = [...new Set(events.map((e) => e.style))];

          return {
            id: comp.id,
            name: comp.name,
            slug: comp.slug,
            organizationName: org?.name ?? null,
            city: comp.city,
            state: comp.state,
            startDate,
            styles,
          };
        }),
      );

      let filtered = enriched;
      if (filters.year) {
        filtered = filtered.filter((c) => c.startDate && c.startDate.startsWith(String(filters.year)));
      }
      if (filters.style) {
        filtered = filtered.filter((c) => c.styles.includes(filters.style!));
      }

      // Sort by date descending
      filtered.sort((a, b) => {
        if (!a.startDate && !b.startDate) return 0;
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        return b.startDate.localeCompare(a.startDate);
      });

      const total = filtered.length;
      const limit = filters.limit ?? 20;
      const offset = filters.offset ?? 0;

      return {
        competitions: filtered.slice(offset, offset + limit),
        total,
      };
    }),

  // ── Competition preview ─────────────────────────────────────────
  getCompetitionPreview: publicProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ input }) => {
      const comp = await db.query.competitions.findFirst({
        where: eq(competitions.id, input.competitionId),
      });
      if (!comp) return null;

      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, comp.orgId),
      });

      const days = await db.query.competitionDays.findMany({
        where: eq(competitionDays.competitionId, comp.id),
        orderBy: asc(competitionDays.position),
      });

      const dates = days.map((d) => d.date).sort();

      const events = await db.query.competitionEvents.findMany({
        where: eq(competitionEvents.competitionId, comp.id),
      });

      const regs = await db.query.competitionRegistrations.findMany({
        where: and(
          eq(competitionRegistrations.competitionId, comp.id),
          eq(competitionRegistrations.cancelled, false),
        ),
      });

      return {
        id: comp.id,
        name: comp.name,
        slug: comp.slug,
        status: comp.status,
        organizationName: org?.name ?? null,
        city: comp.city,
        state: comp.state,
        startDate: dates[0] ?? null,
        endDate: dates[dates.length - 1] ?? null,
        eventCount: events.length,
        registrationCount: regs.length,
        styles: [...new Set(events.map((e) => e.style))],
      };
    }),
});
