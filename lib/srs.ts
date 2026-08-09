// lib/srs.ts
export type Grade = 0 | 1 | 2;

export interface SRSCard {
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  correct_streak: number;
  wrong_streak: number;
  phase: "new" | "learning" | "reviewing" | "mastered";
}

export interface SRSResult extends SRSCard {
  next_review: Date;
}

export function calculateSRS(grade: Grade, card: SRSCard): SRSResult {
  let {
    ease_factor,
    interval_days,
    repetitions,
    correct_streak,
    wrong_streak,
    phase,
  } = card;

  const now = new Date();
  let next_review = new Date();

  // ── FORGOT ──
  if (grade === 0) {
    wrong_streak++;
    correct_streak = 0;
    ease_factor = Math.max(1.3, ease_factor - 0.3);

    if (phase === "mastered") {
      phase = "reviewing";
      interval_days = 1;
      next_review.setDate(next_review.getDate() + 1);
    } else {
      phase = "learning";
      interval_days = 0;
      // Revoir dans 10 minutes
      next_review = new Date(now.getTime() + 10 * 60 * 1000);
    }
    repetitions = 0;

    return {
      ease_factor,
      interval_days,
      repetitions,
      correct_streak,
      wrong_streak,
      phase,
      next_review,
    };
  }

  // ── ALMOST ──
  if (grade === 1) {
    correct_streak++;
    wrong_streak = 0;
    ease_factor = Math.max(1.3, ease_factor - 0.1);

    if (phase === "new" || phase === "learning") {
      phase = "learning";
      interval_days = 0;
      // Revoir dans 1 heure
      next_review = new Date(now.getTime() + 60 * 60 * 1000);

      return {
        ease_factor,
        interval_days,
        repetitions,
        correct_streak,
        wrong_streak,
        phase,
        next_review,
      };
    }

    // reviewing / mastered → réduit l'intervalle
    interval_days = Math.max(1, Math.round(interval_days * 0.8));
    next_review.setDate(next_review.getDate() + interval_days);

    return {
      ease_factor,
      interval_days,
      repetitions,
      correct_streak,
      wrong_streak,
      phase,
      next_review,
    };
  }

  // ── GOT IT ──
  correct_streak++;
  wrong_streak = 0;
  ease_factor = Math.min(2.5, ease_factor + 0.1);
  repetitions++;

  if (phase === "new" || phase === "learning") {
    if (repetitions === 1) {
      // Première réussite → revoir dans 1 jour
      interval_days = 1;
      phase = "learning";
    } else if (repetitions === 2) {
      // Deuxième réussite → revoir dans 3 jours
      interval_days = 3;
      phase = "reviewing";
    } else {
      // Troisième+ → SRS normal
      interval_days = Math.round(interval_days * ease_factor);
      phase = repetitions >= 4 ? "mastered" : "reviewing";
    }
  } else if (phase === "reviewing") {
    interval_days = Math.round(interval_days * ease_factor);
    if (correct_streak >= 5 && interval_days >= 21) {
      phase = "mastered";
    }
  } else {
    // mastered
    interval_days = Math.round(interval_days * ease_factor);
  }

  // Cap à 180 jours max
  interval_days = Math.min(interval_days, 180);

  next_review.setDate(next_review.getDate() + interval_days);

  return {
    ease_factor,
    interval_days,
    repetitions,
    correct_streak,
    wrong_streak,
    phase,
    next_review,
  };
}

/**
 * Priorité de révision - plus haute = revoir en premier
 * Prend en compte : retard, phase, wrong_streak
 */
export function getPriority(card: SRSCard & { next_review: string }): number {
  const now = Date.now();
  const due = new Date(card.next_review).getTime();
  const overdueHours = Math.max(0, (now - due) / (1000 * 60 * 60));

  let priority = overdueHours;

  // Cartes oubliées récemment → priorité haute
  priority += card.wrong_streak * 24;

  // Learning cards → toujours en premier
  if (card.phase === "learning") priority += 100;

  // Mastered → en dernier
  if (card.phase === "mastered") priority -= 10;

  return priority;
}

/**
 * Formate le prochain intervalle pour l'affichage
 */
export function formatNextReview(date: string): string {
  const now = Date.now();
  const due = new Date(date).getTime();
  const diffMs = due - now;

  if (diffMs <= 0) return "Now";

  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m`;

  const diffH = Math.round(diffMs / 3600000);
  if (diffH < 24) return `${diffH}h`;

  const diffD = Math.round(diffMs / 86400000);
  return `${diffD}d`;
}
