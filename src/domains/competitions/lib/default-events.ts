/**
 * Default event generation config.
 *
 * For each style, defines which dances exist and how they group at each level.
 * "grouped" dances form a single multi-dance event; remaining dances are
 * individual single-dance events.
 *
 * When an organizer creates a competition and selects styles, the system
 * generates all events from this config. The organizer then prunes what
 * they don't want.
 */

export type DanceStyle = "standard" | "smooth" | "latin" | "rhythm" | "nightclub";
export type CompetitionLevel =
  | "newcomer"
  | "bronze"
  | "silver"
  | "gold"
  | "novice"
  | "prechamp"
  | "champ";

interface LevelGrouping {
  grouped: string[]; // dances grouped into a multi-dance event (empty = all singles)
}

interface StyleConfig {
  dances: string[];
  levels: Record<CompetitionLevel, LevelGrouping>;
}

const STANDARD: StyleConfig = {
  dances: ["Waltz", "Tango", "Foxtrot", "Quickstep", "Viennese Waltz"],
  levels: {
    newcomer: { grouped: [] },
    bronze: { grouped: [] },
    silver: { grouped: ["Waltz", "Quickstep"] },
    gold: { grouped: ["Waltz", "Tango", "Quickstep"] },
    novice: { grouped: ["Waltz", "Foxtrot", "Quickstep"] },
    prechamp: { grouped: ["Waltz", "Tango", "Foxtrot", "Quickstep"] },
    champ: { grouped: ["Waltz", "Tango", "Foxtrot", "Quickstep", "Viennese Waltz"] },
  },
};

const SMOOTH: StyleConfig = {
  dances: ["Waltz", "Tango", "Foxtrot", "Viennese Waltz"],
  levels: {
    newcomer: { grouped: [] },
    bronze: { grouped: [] },
    silver: { grouped: [] },
    gold: { grouped: ["Waltz", "Foxtrot"] },
    novice: { grouped: ["Waltz", "Tango", "Foxtrot"] },
    prechamp: { grouped: ["Waltz", "Tango", "Foxtrot", "Viennese Waltz"] },
    champ: { grouped: ["Waltz", "Tango", "Foxtrot", "Viennese Waltz"] },
  },
};

const LATIN: StyleConfig = {
  dances: ["Cha Cha", "Samba", "Rumba", "Paso Doble", "Jive"],
  levels: {
    newcomer: { grouped: [] },
    bronze: { grouped: [] },
    silver: { grouped: ["Cha Cha", "Rumba"] },
    gold: { grouped: ["Cha Cha", "Samba", "Rumba"] },
    novice: { grouped: ["Cha Cha", "Samba", "Rumba"] },
    prechamp: { grouped: ["Cha Cha", "Samba", "Rumba", "Jive"] },
    champ: { grouped: ["Cha Cha", "Samba", "Rumba", "Paso Doble", "Jive"] },
  },
};

const RHYTHM: StyleConfig = {
  dances: ["Cha Cha", "Rumba", "Swing", "Bolero", "Mambo"],
  levels: {
    newcomer: { grouped: [] },
    bronze: { grouped: [] },
    silver: { grouped: ["Cha Cha", "Rumba"] },
    gold: { grouped: ["Cha Cha", "Rumba", "Swing"] },
    novice: { grouped: ["Cha Cha", "Rumba", "Swing"] },
    prechamp: { grouped: ["Cha Cha", "Rumba", "Swing", "Bolero"] },
    champ: { grouped: ["Cha Cha", "Rumba", "Swing", "Bolero", "Mambo"] },
  },
};

const STYLE_CONFIGS: Record<DanceStyle, StyleConfig | null> = {
  standard: STANDARD,
  smooth: SMOOTH,
  latin: LATIN,
  rhythm: RHYTHM,
  nightclub: null, // TBD — no default groupings yet
};

export interface GeneratedEvent {
  name: string;
  style: DanceStyle;
  level: CompetitionLevel;
  eventType: "single_dance" | "multi_dance";
  dances: string[];
}

const LEVEL_DISPLAY: Record<CompetitionLevel, string> = {
  newcomer: "Newcomer",
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  novice: "Novice",
  prechamp: "Pre-champ",
  champ: "Champ",
};

const STYLE_DISPLAY: Record<DanceStyle, string> = {
  standard: "Standard",
  smooth: "Smooth",
  latin: "Latin",
  rhythm: "Rhythm",
  nightclub: "Nightclub",
};

function abbreviateDances(dances: string[]): string {
  return dances
    .map((d) => {
      if (d === "Viennese Waltz") return "V. Waltz";
      if (d === "Paso Doble") return "Paso";
      return d.split(" ")[0];
    })
    .join("/");
}

export function generateDefaultEvents(styles: DanceStyle[]): GeneratedEvent[] {
  const events: GeneratedEvent[] = [];
  const levels: CompetitionLevel[] = [
    "newcomer",
    "bronze",
    "silver",
    "gold",
    "novice",
    "prechamp",
    "champ",
  ];

  for (const style of styles) {
    const config = STYLE_CONFIGS[style];
    if (!config) continue;

    for (const level of levels) {
      const { grouped } = config.levels[level];
      const styleLabel = STYLE_DISPLAY[style];
      const levelLabel = LEVEL_DISPLAY[level];

      // Multi-dance event (if any dances are grouped)
      if (grouped.length > 0) {
        events.push({
          name: `${levelLabel} ${styleLabel} ${abbreviateDances(grouped)}`,
          style,
          level,
          eventType: "multi_dance",
          dances: grouped,
        });
      }

      // Single-dance events for remaining dances
      const singles = config.dances.filter((d) => !grouped.includes(d));
      for (const dance of singles) {
        events.push({
          name: `${levelLabel} ${styleLabel} ${dance}`,
          style,
          level,
          eventType: "single_dance",
          dances: [dance],
        });
      }
    }
  }

  return events;
}
