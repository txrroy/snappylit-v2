import { Platform } from 'react-native';

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 9999,
} as const;

export const typography = {
  micro: { fontSize: 10.5, lineHeight: 14, letterSpacing: 0.6 },
  caption: { fontSize: 12, lineHeight: 16, letterSpacing: 0.1 },
  footnote: { fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  body: { fontSize: 14.5, lineHeight: 21, letterSpacing: -0.1 },
  subhead: { fontSize: 15.5, lineHeight: 22, letterSpacing: -0.15 },
  headline: { fontSize: 17, lineHeight: 23, letterSpacing: -0.25 },
  title3: { fontSize: 20, lineHeight: 26, letterSpacing: -0.4 },
  title2: { fontSize: 24, lineHeight: 30, letterSpacing: -0.55 },
  metric: { fontSize: 30, lineHeight: 34, letterSpacing: -0.8 },
  display: { fontSize: 38, lineHeight: 42, letterSpacing: -1.1 },
} as const;

export const fontFamilies = {
  sans: Platform.select({
    ios: 'Cabinet Grotesk',
    web: "'Cabinet Grotesk', 'DM Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    default: 'Cabinet Grotesk',
  }),
  serif: Platform.select({
    ios: 'Cabinet Grotesk',
    web: "'Cabinet Grotesk', 'DM Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    default: 'Cabinet Grotesk',
  }),
  mono: Platform.select({
    ios: 'Cabinet Grotesk',
    web: "'Cabinet Grotesk', 'DM Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    default: 'Cabinet Grotesk',
  }),
} as const;

export const layout = {
  topBarHeight: 54,
  sidebarWidth: 236,
  drawerMaxWidth: 900,
  contentMaxWidth: 960,
  borderWidth: 1,
} as const;

export type DSSpacingKey = keyof typeof spacing;
export type DSRadiiKey = keyof typeof radii;
export type DSTypographyKey = keyof typeof typography;

