import { CardProgress, Rating } from './types';

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

export function scheduleReview(previous: CardProgress | undefined, rating: Rating, now = Date.now()): CardProgress {
  const ease = previous?.ease ?? 2.5;
  const repetitions = previous?.repetitions ?? 0;
  const interval = previous?.intervalDays ?? 0;
  let nextEase = ease;
  let nextRepetitions = repetitions + 1;
  let nextInterval = interval;
  let dueAt = now;

  if (rating === 'again') {
    nextEase = Math.max(1.3, ease - 0.2);
    nextRepetitions = 0;
    nextInterval = 0;
    dueAt = now + 10 * MINUTE;
  } else if (rating === 'hard') {
    nextEase = Math.max(1.3, ease - 0.15);
    nextInterval = repetitions === 0 ? 1 : Math.max(1, interval * 1.2);
    dueAt = now + nextInterval * DAY;
  } else if (rating === 'good') {
    nextInterval = repetitions === 0 ? 1 : repetitions === 1 ? 3 : Math.max(1, interval * ease);
    dueAt = now + nextInterval * DAY;
  } else {
    nextEase = ease + 0.15;
    nextInterval = repetitions === 0 ? 4 : Math.max(4, interval * (ease + 0.15));
    dueAt = now + nextInterval * DAY;
  }

  return {
    intervalDays: Math.round(nextInterval * 10) / 10,
    ease: Math.round(nextEase * 100) / 100,
    repetitions: nextRepetitions,
    dueAt,
    lastReviewedAt: now,
    lastRating: rating,
    reviewCount: (previous?.reviewCount ?? 0) + 1,
  };
}

export function intervalPreview(previous: CardProgress | undefined, rating: Rating) {
  const result = scheduleReview(previous, rating, Date.now());
  if (rating === 'again') return '10 Min.';
  if (result.intervalDays < 2) return '1 Tag';
  if (result.intervalDays < 30) return `${Math.round(result.intervalDays)} Tage`;
  return `${Math.round(result.intervalDays / 30)} Mon.`;
}

export function isDue(progress?: CardProgress, now = Date.now()) {
  return !progress || progress.dueAt <= now;
}

export function formatDue(dueAt: number) {
  const difference = dueAt - Date.now();
  if (difference <= 0) return 'jetzt';
  if (difference < DAY) return `in ${Math.max(1, Math.round(difference / (60 * 60 * 1000)))} Std.`;
  const days = Math.max(1, Math.round(difference / DAY));
  return days === 1 ? 'morgen' : `in ${days} Tagen`;
}
