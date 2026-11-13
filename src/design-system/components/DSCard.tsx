import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { useDSTheme } from '../ThemeContext';
import type { DSSpacingKey } from '../tokens';
import { DSText } from './DSText';

export interface DSCardProps extends ViewProps {
  headerTitle?: string;
  headerSubtitle?: string;
  headerRight?: ReactNode;
  padding?: DSSpacingKey;
  elevated?: boolean;
  /** Optional muted surface instead of crisp white */
  muted?: boolean;
  children: ReactNode;
}

/**
 * Clean editorial module surface with typographic header and subtle tonal framing.
 */
export function DSCard({
  headerTitle,
  headerSubtitle,
  headerRight,
  padding = 'lg',
  elevated = false,
  muted = false,
  style,
  children,
  ...rest
}: DSCardProps) {
  const { theme } = useDSTheme();
  const hasHeader = Boolean(headerTitle || headerSubtitle || headerRight);
  const pad = theme.spacing[padding];

  return (
    <View
      style={[
        {
          backgroundColor: muted
            ? theme.colors.surfaceHeader
            : elevated
              ? theme.colors.surfaceElevated
              : theme.colors.surface,
          borderRadius: theme.radii.lg,
          borderWidth: theme.cardBorderWidth,
          borderColor: theme.colors.borderSubtle,
          overflow: 'hidden',
          ...(elevated ? theme.shadows.elevated : theme.shadows.card),
        },
        style,
      ]}
      {...rest}
    >
      {hasHeader ? (
        <View
          style={{
            paddingHorizontal: pad,
            paddingTop: pad,
            paddingBottom: theme.spacing.sm,
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: theme.spacing.md,
          }}
        >
          <View style={{ flex: 1 }}>
            {headerTitle ? (
              <DSText variant="subhead" weight="bold" tone="primary">
                {headerTitle}
              </DSText>
            ) : null}
            {headerSubtitle ? (
              <DSText
                variant="caption"
                tone="secondary"
                style={{ marginTop: theme.spacing.xxs }}
              >
                {headerSubtitle}
              </DSText>
            ) : null}
          </View>
          {headerRight}
        </View>
      ) : null}

      <View
        style={{
          paddingHorizontal: pad,
          paddingBottom: pad,
          paddingTop: hasHeader ? theme.spacing.xs : pad,
        }}
      >
        {children}
      </View>
    </View>
  );
}

export interface DSSurfaceProps extends ViewProps {
  variant?: 'canvas' | 'surface' | 'muted' | 'elevated' | 'header' | 'ink';
  radius?: keyof ReturnType<typeof useDSTheme>['theme']['radii'];
  bordered?: boolean;
}

export function DSSurface({
  variant = 'surface',
  radius,
  bordered = false,
  style,
  children,
  ...rest
}: DSSurfaceProps) {
  const { theme } = useDSTheme();

  const bgMap = {
    canvas: theme.colors.canvas,
    surface: theme.colors.surface,
    muted: theme.colors.surfaceMuted,
    elevated: theme.colors.surfaceElevated,
    header: theme.colors.surfaceHeader,
    ink: theme.colors.surfaceInk,
  } as const;

  return (
    <View
      style={[
        {
          backgroundColor: bgMap[variant],
          borderRadius: radius ? theme.radii[radius] : undefined,
          borderWidth: bordered ? theme.cardBorderWidth : undefined,
          borderColor: bordered ? theme.colors.borderSubtle : undefined,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

export function DSDivider({ vertical = false }: { vertical?: boolean }) {
  const { theme } = useDSTheme();
  return (
    <View
      style={
        vertical
          ? {
              width: theme.layout.borderWidth,
              alignSelf: 'stretch',
              backgroundColor: theme.colors.borderSubtle,
            }
          : {
              height: theme.layout.borderWidth,
              width: '100%',
              backgroundColor: theme.colors.borderSubtle,
            }
      }
    />
  );
}
