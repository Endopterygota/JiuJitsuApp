export type Technique = {
  id: string;
  names: { de: string; en: string; ja: string; romaji: string };
  category: string;
  subcategory: string;
  position: string;
  summary: string;
  steps: string[];
  keyPoints: string[];
  safety: string;
  sourceTitle: string;
  sourceUrl: string;
};

export type Rating = 'again' | 'hard' | 'good' | 'easy';

export type CardProgress = {
  intervalDays: number;
  ease: number;
  repetitions: number;
  dueAt: number;
  lastReviewedAt: number;
  lastRating: Rating;
  reviewCount: number;
};

export type ProgressMap = Record<string, CardProgress>;
