// types/index.ts
export interface Flashcard {
  id: string;
  character: string;
  pinyin: string;
  definition: string;
  translation?: string;
  word_type?: string;
  audio_url?: string;
  sentence_chinese?: string;
  sentence_pinyin?: string;
  sentence_english?: string;
  examples?: Array<{
    chinese: string;
    pinyin: string;
    french: string;
  }>;

  // SRS
  phase: "new" | "learning" | "reviewing" | "mastered";
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review: string;
  correct_streak: number;
  wrong_streak: number;

  // Lesson
  lesson_date?: string | null;
  lesson_unlocked?: boolean;

  created_at?: string;
}

export interface LessonProgress {
  id: string;
  lesson_number: number;
  completed: boolean;
  completed_date: string;
  cards_count: number;
  score: number;
  created_at: string;
}

export interface AppStats {
  new_: number;
  learning: number;
  reviewing: number;
  mastered: number;
  dueCount: number;
  totalCards: number;
  streak: number;
}
