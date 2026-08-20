export type ContentStage = 1 | 2 | 3 | 4;

export interface StageTargets {
  vocab: number;
  dialogues: number;
  phrases: number;
}

/** Monday–Tue = 1, Wed–Thu = 2, Fri–Sat = 3, Sunday = 4 */
const STAGE_TARGETS: Record<ContentStage, StageTargets> = {
  1: { vocab: 16, dialogues: 2, phrases: 8 },
  2: { vocab: 24, dialogues: 3, phrases: 12 },
  3: { vocab: 32, dialogues: 4, phrases: 16 },
  4: { vocab: 40, dialogues: 5, phrases: 20 },
};

export function localDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO-style week: Monday is day 0. */
export function getWeekStart(date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return localDateString(d);
}

export function getWeekDayIndex(date = new Date()): number {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

export function getContentStage(date = new Date()): ContentStage {
  const index = getWeekDayIndex(date);
  return Math.min(4, Math.floor(index / 2) + 1) as ContentStage;
}

export function getStageTargets(stage: ContentStage): StageTargets {
  return STAGE_TARGETS[stage];
}

export function getWeekEnd(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + 6);
  return localDateString(date);
}

export function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(`${getWeekEnd(weekStart)}T00:00:00`);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, { ...opts, year: "numeric" })}`;
}

export function countDialogueGroups(
  phrases: { phrase_type: string }[],
): number {
  let groups = 0;
  let inDialogue = false;
  for (const phrase of phrases) {
    if (phrase.phrase_type === "dialogue") {
      if (!inDialogue) {
        groups += 1;
        inDialogue = true;
      }
    } else {
      inDialogue = false;
    }
  }
  return groups;
}
