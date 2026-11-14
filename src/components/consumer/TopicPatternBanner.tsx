import { View } from 'react-native';

interface TopicPalette {
  bg: string;
  primary: string;
  secondary: string;
  accent: string;
  variant: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

const TOPIC_PALETTES: Record<string, TopicPalette> = {
  politics: {
    bg: '#1E293B',
    primary: 'rgba(249, 115, 22, 0.36)',
    secondary: 'rgba(56, 189, 248, 0.28)',
    accent: 'rgba(248, 250, 252, 0.22)',
    variant: 0,
  },
  technology: {
    bg: '#0F172A',
    primary: 'rgba(20, 184, 166, 0.4)',
    secondary: 'rgba(34, 211, 238, 0.25)',
    accent: 'rgba(167, 243, 208, 0.25)',
    variant: 1,
  },
  environment: {
    bg: '#14332B',
    primary: 'rgba(52, 211, 153, 0.35)',
    secondary: 'rgba(251, 191, 36, 0.28)',
    accent: 'rgba(167, 243, 208, 0.2)',
    variant: 2,
  },
  climate: {
    bg: '#132A2E',
    primary: 'rgba(45, 212, 191, 0.36)',
    secondary: 'rgba(250, 204, 21, 0.24)',
    accent: 'rgba(204, 251, 241, 0.2)',
    variant: 2,
  },
  economy: {
    bg: '#1C1917',
    primary: 'rgba(217, 119, 6, 0.38)',
    secondary: 'rgba(253, 230, 138, 0.24)',
    accent: 'rgba(168, 162, 158, 0.2)',
    variant: 3,
  },
  conflict: {
    bg: '#272022',
    primary: 'rgba(239, 68, 68, 0.34)',
    secondary: 'rgba(251, 146, 60, 0.28)',
    accent: 'rgba(254, 202, 202, 0.18)',
    variant: 4,
  },
  defense: {
    bg: '#1F2421',
    primary: 'rgba(245, 158, 11, 0.32)',
    secondary: 'rgba(148, 163, 184, 0.28)',
    accent: 'rgba(226, 232, 240, 0.18)',
    variant: 4,
  },
  security: {
    bg: '#18181B',
    primary: 'rgba(244, 63, 94, 0.32)',
    secondary: 'rgba(161, 161, 170, 0.26)',
    accent: 'rgba(244, 244, 245, 0.16)',
    variant: 4,
  },
  science: {
    bg: '#1E1B4B',
    primary: 'rgba(129, 140, 248, 0.38)',
    secondary: 'rgba(45, 212, 191, 0.28)',
    accent: 'rgba(224, 231, 255, 0.22)',
    variant: 5,
  },
  health: {
    bg: '#162A35',
    primary: 'rgba(56, 189, 248, 0.34)',
    secondary: 'rgba(52, 211, 153, 0.28)',
    accent: 'rgba(224, 242, 254, 0.2)',
    variant: 5,
  },
  diplomacy: {
    bg: '#172554',
    primary: 'rgba(96, 165, 250, 0.36)',
    secondary: 'rgba(251, 191, 36, 0.26)',
    accent: 'rgba(219, 234, 254, 0.2)',
    variant: 6,
  },
  society: {
    bg: '#2E1032',
    primary: 'rgba(244, 114, 182, 0.34)',
    secondary: 'rgba(251, 113, 133, 0.26)',
    accent: 'rgba(252, 231, 243, 0.2)',
    variant: 7,
  },
};

const FALLBACK_PALETTES = Object.values(TOPIC_PALETTES);

function getPaletteForTopic(topic?: string): TopicPalette {
  const key = topic?.trim().toLowerCase() ?? '';
  if (key && TOPIC_PALETTES[key]) {
    return TOPIC_PALETTES[key];
  }
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_PALETTES[hash % FALLBACK_PALETTES.length];
}

export function TopicPatternBanner({ topic }: { topic?: string }) {
  const palette = getPaletteForTopic(topic);

  return (
    <View
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: palette.bg,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Variant 0: Diagonal ribbons & orb */}
      {palette.variant === 0 ? (
        <>
          <View
            style={{
              position: 'absolute',
              top: -40,
              right: -30,
              width: 190,
              height: 190,
              borderRadius: 95,
              backgroundColor: palette.primary,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: -55,
              left: 30,
              width: 240,
              height: 120,
              backgroundColor: palette.secondary,
              transform: [{ rotate: '-18deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 24,
              left: -20,
              width: 110,
              height: 110,
              borderRadius: 55,
              borderWidth: 2,
              borderColor: palette.accent,
            }}
          />
        </>
      ) : null}

      {/* Variant 1: Concentric orbital rings */}
      {palette.variant === 1 ? (
        <>
          <View
            style={{
              position: 'absolute',
              top: -50,
              right: -20,
              width: 220,
              height: 220,
              borderRadius: 110,
              borderWidth: 24,
              borderColor: palette.primary,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: -60,
              left: -30,
              width: 180,
              height: 180,
              borderRadius: 90,
              backgroundColor: palette.secondary,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 32,
              right: 84,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: palette.accent,
            }}
          />
        </>
      ) : null}

      {/* Variant 2: Layered organic horizon waves */}
      {palette.variant === 2 ? (
        <>
          <View
            style={{
              position: 'absolute',
              top: -28,
              right: 28,
              width: 110,
              height: 110,
              borderRadius: 55,
              backgroundColor: palette.secondary,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: -95,
              left: -40,
              width: 320,
              height: 180,
              borderRadius: 160,
              backgroundColor: palette.primary,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: -115,
              right: -50,
              width: 280,
              height: 170,
              borderRadius: 140,
              backgroundColor: palette.accent,
            }}
          />
        </>
      ) : null}

      {/* Variant 3: Bauhaus stepped blocks & quarter arc */}
      {palette.variant === 3 ? (
        <>
          <View
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 150,
              height: 150,
              borderBottomLeftRadius: 150,
              backgroundColor: palette.primary,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 48,
              width: 90,
              height: 68,
              backgroundColor: palette.secondary,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 150,
              width: 48,
              height: 108,
              backgroundColor: palette.accent,
            }}
          />
        </>
      ) : null}

      {/* Variant 4: Intersecting rotated diamonds */}
      {palette.variant === 4 ? (
        <>
          <View
            style={{
              position: 'absolute',
              top: -35,
              right: 20,
              width: 140,
              height: 140,
              backgroundColor: palette.primary,
              transform: [{ rotate: '45deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: -55,
              right: 110,
              width: 130,
              height: 130,
              backgroundColor: palette.secondary,
              transform: [{ rotate: '45deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 26,
              left: -30,
              width: 96,
              height: 96,
              borderWidth: 2,
              borderColor: palette.accent,
              transform: [{ rotate: '30deg' }],
            }}
          />
        </>
      ) : null}

      {/* Variant 5: Dual-sphere overlap & crisp ring */}
      {palette.variant === 5 ? (
        <>
          <View
            style={{
              position: 'absolute',
              top: -20,
              left: 60,
              width: 160,
              height: 160,
              borderRadius: 80,
              backgroundColor: palette.primary,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: -40,
              right: 20,
              width: 170,
              height: 170,
              borderRadius: 85,
              backgroundColor: palette.secondary,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 22,
              right: 26,
              width: 64,
              height: 64,
              borderRadius: 32,
              borderWidth: 2,
              borderColor: palette.accent,
            }}
          />
        </>
      ) : null}

      {/* Variant 6: Meridian arcs */}
      {palette.variant === 6 ? (
        <>
          <View
            style={{
              position: 'absolute',
              top: -60,
              left: -40,
              width: 240,
              height: 240,
              borderRadius: 120,
              borderWidth: 28,
              borderColor: palette.primary,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: -50,
              right: -20,
              width: 190,
              height: 190,
              borderRadius: 95,
              backgroundColor: palette.secondary,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 38,
              right: 36,
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: palette.accent,
            }}
          />
        </>
      ) : null}

      {/* Variant 7: Modernist tilted blocks & circle */}
      {palette.variant === 7 ? (
        <>
          <View
            style={{
              position: 'absolute',
              top: -20,
              right: -10,
              width: 165,
              height: 130,
              borderRadius: 28,
              backgroundColor: palette.primary,
              transform: [{ rotate: '14deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: -45,
              left: 24,
              width: 150,
              height: 150,
              borderRadius: 75,
              backgroundColor: palette.secondary,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 28,
              left: 110,
              width: 52,
              height: 52,
              borderRadius: 14,
              borderWidth: 2,
              borderColor: palette.accent,
              transform: [{ rotate: '-12deg' }],
            }}
          />
        </>
      ) : null}
    </View>
  );
}
