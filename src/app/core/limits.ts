export const LIMITS = {
  name: { min: 2, max: 60 },
  email: { min: 6 },
  password: { min: 6, max: 72 },
  search: { min: 2, max: 80 },
  review: { min: 1, max: 1000 },
  score: { min: 0, max: 100 },
  year: { min: 1888, max: 2100 },
} as const;
