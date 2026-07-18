export const typography = {
  display: {
    fontFamily: "Geist",
    fontSize: "48px",
    fontWeight: "600",
    lineHeight: "1.1",
    letterSpacing: "-0.04em",
  },
  h1: {
    fontFamily: "Geist",
    fontSize: "32px",
    fontWeight: "600",
    lineHeight: "1.2",
    letterSpacing: "-0.02em",
  },
  h2: {
    fontFamily: "Geist",
    fontSize: "24px",
    fontWeight: "500",
    lineHeight: "1.3",
    letterSpacing: "-0.01em",
  },
  bodyLg: {
    fontFamily: "Inter",
    fontSize: "18px",
    fontWeight: "400",
    lineHeight: "1.6",
  },
  bodyMd: {
    fontFamily: "Inter",
    fontSize: "15px",
    fontWeight: "400",
    lineHeight: "1.5",
  },
  labelSm: {
    fontFamily: "Inter",
    fontSize: "13px",
    fontWeight: "500",
    lineHeight: "1.4",
    letterSpacing: "0.05em",
  },
  monoCode: {
    fontFamily: "JetBrains Mono",
    fontSize: "14px",
    fontWeight: "400",
    lineHeight: "1.5",
  },
} as const;

export type TypographyToken = keyof typeof typography;
