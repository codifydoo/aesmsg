export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "48px",
  xxl: "80px",
} as const;

export type SpacingToken = keyof typeof spacing;
