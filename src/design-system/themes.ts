import { fontFamilies, layout, radii, spacing, typography } from './tokens';

export type ThemeId = 'apple-hig' | 'dark';

export interface SemanticTone {
  bg: string;
  border: string;
  text: string;
  dot: string;
}

export interface DSColors {
  canvas: string;
  canvasSubtle: string;
  surface: string;
  surfaceHeader: string;
  surfaceElevated: string;
  surfaceMuted: string;
  surfaceHover: string;
  surfaceSelected: string;
  surfaceInk: string;
  topBar: string;

  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  inkText: string;

  borderSubtle: string;
  borderDefault: string;
  borderStrong: string;

  accent: string;
  accentSoft: string;
  accentBorder: string;
  accentText: string;

  backdrop: string;
  shadowColor: string;

  tones: {
    neutral: SemanticTone;
    accent: SemanticTone;
    success: SemanticTone;
    warning: SemanticTone;
    danger: SemanticTone;
    info: SemanticTone;
  };
}

export interface DSShadow {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
}

export interface DSTheme {
  id: ThemeId;
  name: string;
  isDark: boolean;
  cardBorderWidth: number;
  colors: DSColors;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  fontFamilies: typeof fontFamilies;
  layout: typeof layout;
  shadows: {
    card: DSShadow;
    elevated: DSShadow;
    popover: DSShadow;
    pill: DSShadow;
  };
}

export const appleHigTheme: DSTheme = {
  id: 'apple-hig',
  name: 'Editorial',
  isDark: false,
  cardBorderWidth: 1,
  colors: {
    canvas: '#FAFAF9',
    canvasSubtle: '#F3F2EF',
    surface: '#FFFFFF',
    surfaceHeader: '#F7F6F4',
    surfaceElevated: '#FFFFFF',
    surfaceMuted: '#F1F0EC',
    surfaceHover: '#EBEAE5',
    surfaceSelected: 'rgba(184, 59, 29, 0.08)',
    surfaceInk: '#141413',
    topBar: '#FAFAF9',

    textPrimary: '#141413',
    textSecondary: '#4B4A46',
    textTertiary: '#66645E',
    textInverse: '#FFFFFF',
    inkText: '#FAFAF9',

    borderSubtle: 'rgba(20, 20, 19, 0.08)',
    borderDefault: 'rgba(20, 20, 19, 0.14)',
    borderStrong: 'rgba(20, 20, 19, 0.24)',

    accent: '#B83B1D',
    accentSoft: 'rgba(184, 59, 29, 0.08)',
    accentBorder: 'rgba(184, 59, 29, 0.28)',
    accentText: '#A13217',

    backdrop: 'rgba(20, 20, 19, 0.36)',
    shadowColor: '#141413',

    tones: {
      neutral: {
        bg: '#F1F0EC',
        border: 'rgba(20, 20, 19, 0.10)',
        text: '#4B4A46',
        dot: '#66645E',
      },
      accent: {
        bg: 'rgba(184, 59, 29, 0.09)',
        border: 'rgba(184, 59, 29, 0.28)',
        text: '#A13217',
        dot: '#B83B1D',
      },
      success: {
        bg: '#F0FDF4',
        border: 'rgba(22, 101, 52, 0.24)',
        text: '#166534',
        dot: '#15803D',
      },
      warning: {
        bg: '#FFFBEB',
        border: 'rgba(146, 64, 14, 0.26)',
        text: '#92400E',
        dot: '#B45309',
      },
      danger: {
        bg: '#FEF2F2',
        border: 'rgba(153, 27, 27, 0.24)',
        text: '#991B1B',
        dot: '#B91C1C',
      },
      info: {
        bg: '#F1F5F9',
        border: 'rgba(51, 65, 85, 0.22)',
        text: '#334155',
        dot: '#475569',
      },
    },
  },
  spacing,
  radii,
  typography,
  fontFamilies,
  layout,
  shadows: {
    card: {
      shadowColor: '#181817',
      shadowOpacity: 0.025,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    elevated: {
      shadowColor: '#181817',
      shadowOpacity: 0.04,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    popover: {
      shadowColor: '#181817',
      shadowOpacity: 0.12,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
    pill: {
      shadowColor: '#181817',
      shadowOpacity: 0.04,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
  },
};

export const darkTheme: DSTheme = {
  id: 'dark',
  name: 'Charcoal',
  isDark: true,
  cardBorderWidth: 1,
  colors: {
    canvas: '#131312',
    canvasSubtle: '#191917',
    surface: '#1D1D1B',
    surfaceHeader: '#232220',
    surfaceElevated: '#252422',
    surfaceMuted: '#292825',
    surfaceHover: '#31302C',
    surfaceSelected: 'rgba(224, 108, 79, 0.16)',
    surfaceInk: '#2B2A27',
    topBar: 'rgba(19, 19, 18, 0.92)',

    textPrimary: '#F3F1EC',
    textSecondary: '#A8A49B',
    textTertiary: '#78746D',
    textInverse: '#181817',
    inkText: '#F3F1EC',

    borderSubtle: 'rgba(243, 241, 236, 0.07)',
    borderDefault: 'rgba(243, 241, 236, 0.12)',
    borderStrong: 'rgba(243, 241, 236, 0.22)',

    accent: '#E06C4F',
    accentSoft: 'rgba(224, 108, 79, 0.16)',
    accentBorder: 'rgba(224, 108, 79, 0.34)',
    accentText: '#F08A70',

    backdrop: 'rgba(0, 0, 0, 0.62)',
    shadowColor: '#000000',

    tones: {
      neutral: {
        bg: '#292825',
        border: 'rgba(243, 241, 236, 0.10)',
        text: '#C7C3BA',
        dot: '#8C887F',
      },
      accent: {
        bg: 'rgba(224, 108, 79, 0.18)',
        border: 'rgba(224, 108, 79, 0.34)',
        text: '#F08A70',
        dot: '#E06C4F',
      },
      success: {
        bg: 'rgba(72, 168, 118, 0.16)',
        border: 'rgba(72, 168, 118, 0.32)',
        text: '#7FD4A6',
        dot: '#48A876',
      },
      warning: {
        bg: 'rgba(224, 158, 62, 0.16)',
        border: 'rgba(224, 158, 62, 0.32)',
        text: '#F3BE72',
        dot: '#E09E3E',
      },
      danger: {
        bg: 'rgba(224, 92, 82, 0.16)',
        border: 'rgba(224, 92, 82, 0.32)',
        text: '#F59890',
        dot: '#E05C52',
      },
      info: {
        bg: 'rgba(148, 163, 184, 0.16)',
        border: 'rgba(148, 163, 184, 0.30)',
        text: '#CBD5E1',
        dot: '#94A3B8',
      },
    },
  },
  spacing,
  radii,
  typography,
  fontFamilies,
  layout,
  shadows: {
    card: {
      shadowColor: '#000000',
      shadowOpacity: 0.22,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    elevated: {
      shadowColor: '#000000',
      shadowOpacity: 0.32,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    popover: {
      shadowColor: '#000000',
      shadowOpacity: 0.50,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    pill: {
      shadowColor: '#000000',
      shadowOpacity: 0.20,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
  },
};

export const THEMES: Record<ThemeId, DSTheme> = {
  'apple-hig': appleHigTheme,
  dark: darkTheme,
};
