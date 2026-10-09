export const reviewIntervals = [12, 24, 72, 168, 360];

export function normalizeDifficulty(value) {
  const difficulty = Number(value);
  return Number.isFinite(difficulty) ? Math.max(0, Math.min(10, Math.floor(difficulty))) : 0;
}

export function changeDifficulty(record, delta, now = Date.now()) {
  const previous = normalizeDifficulty(record.difficulty);
  record.difficulty = normalizeDifficulty(previous + delta);
  if (record.difficulty > previous || record.difficulty === 0) {
    record.stage = 0;
    record.nextReviewAt = record.difficulty ? new Date(now).toISOString() : '';
  }
  return record.difficulty - previous;
}

export function scheduleReview(record, correct, now = Date.now()) {
  if (!record.difficulty) return false;
  record.stage = correct ? Math.min(record.stage + 1, reviewIntervals.length) : 0;
  record.failures += correct ? 0 : 1;
  record.nextReviewAt = new Date(now + (correct ? reviewIntervals[record.stage - 1] * 3600000 : 0)).toISOString();
  return true;
}

export function answerRecord(record, correct, now = Date.now()) {
  const reviewed = record.difficulty > 0;
  const added = correct ? 0 : changeDifficulty(record, 3, now);
  scheduleReview(record, correct, now);
  return { reviewed, added };
}

export function isReviewDue(record, now = Date.now()) {
  return record?.difficulty > 0 && (!record.nextReviewAt || new Date(record.nextReviewAt).getTime() <= now);
}
