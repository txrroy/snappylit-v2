import { useState } from 'react';
import { View } from 'react-native';
import {
  useDSTheme,
  DSCard,
  DSText,
  DSInput,
  DSButton,
  DSSurface,
} from '@/design-system';

interface AdminLoginScreenProps {
  authError: string | null;
  unauthorizedEmail: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}

const IS_EMULATOR = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true';

export function AdminLoginScreen({
  authError,
  unauthorizedEmail,
  onSignIn,
  onSignUp,
  onSignOut,
}: AdminLoginScreenProps) {
  const { theme } = useDSTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAction = async (mode: 'signin' | 'signup') => {
    if (!email.trim() || !password) return;
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await onSignIn(email, password);
      } else {
        await onSignUp(email, password);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (unauthorizedEmail) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.canvas,
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing.xxl,
        }}
      >
        <DSCard
          headerTitle="Access Restricted"
          elevated
          padding="xxl"
          style={{ width: '100%', maxWidth: 420 }}
        >
          <DSText
            variant="body"
            tone="secondary"
            style={{ marginBottom: theme.spacing.xl }}
          >
            {unauthorizedEmail} is not on the authorized editor list.
          </DSText>
          <DSButton label="Sign Out" variant="secondary" onPress={onSignOut} />
        </DSCard>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.canvas,
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing.xxl,
      }}
    >
      <DSCard
        elevated
        padding="xxl"
        style={{ width: '100%', maxWidth: 420 }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm + 2,
            marginBottom: theme.spacing.lg,
          }}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: theme.radii.pill,
              backgroundColor: theme.colors.textPrimary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <DSText variant="micro" weight="bold" tone="inverse">
              SL
            </DSText>
          </View>
          <View>
            <DSText variant="headline" weight="bold" tone="primary">
              SnappyLit Studio
            </DSText>
            <DSText variant="caption" tone="secondary">
              Editorial desk sign in
            </DSText>
          </View>
        </View>
        {authError ? (
          <DSSurface
            radius="sm"
            bordered
            style={{
              backgroundColor: theme.colors.tones.danger.bg,
              borderColor: theme.colors.tones.danger.border,
              padding: theme.spacing.md,
              marginBottom: theme.spacing.lg,
            }}
          >
            <DSText variant="footnote" tone="danger">
              {authError}
            </DSText>
          </DSSurface>
        ) : null}

        <DSText
          variant="caption"
          weight="semibold"
          tone="secondary"
          style={{ marginBottom: theme.spacing.xs }}
        >
          Email
        </DSText>
        <DSInput
          value={email}
          onChangeText={setEmail}
          placeholder="txrroy@gmail.com"
          autoCapitalize="none"
          keyboardType="email-address"
          style={{ marginBottom: theme.spacing.lg }}
        />

        <DSText
          variant="caption"
          weight="semibold"
          tone="secondary"
          style={{ marginBottom: theme.spacing.xs }}
        >
          Password
        </DSText>
        <DSInput
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          style={{ marginBottom: theme.spacing.xl }}
        />

        <DSButton
          label="Sign In"
          variant="primary"
          size="lg"
          loading={submitting}
          onPress={() => handleAction('signin')}
        />

        {IS_EMULATOR ? (
          <DSButton
            label="Create Account in Local Emulator"
            variant="secondary"
            size="md"
            disabled={submitting}
            onPress={() => handleAction('signup')}
            style={{ marginTop: theme.spacing.md }}
          />
        ) : null}
      </DSCard>
    </View>
  );
}
