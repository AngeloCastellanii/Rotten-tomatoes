export const LIMITS = {
  name: { min: 2, max: 60 },
  email: { min: 6 },
  password: { min: 6, max: 72 },
  search: { min: 2, max: 80 },
} as const;
