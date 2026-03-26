"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { RoutineBuilder } from "@/components/routine/routine-builder";

export default function EditRoutinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const routineId = Number(id);

  const { data: routine, isLoading } = trpc.routine.get.useQuery({
    id: routineId,
  });

  const { data: allDances } = trpc.dance.list.useQuery();

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading routine...</p>
        </div>
      </div>
    );
  }

  if (!routine) {
    notFound();
  }

  const dance = allDances?.find((d) => d.id === routine.danceId);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <RoutineBuilder
        routineId={routine.id}
        danceId={routine.danceId}
        danceName={dance?.name ?? ""}
        initialName={routine.name}
        initialEntries={routine.entries}
      />
    </div>
  );
}
