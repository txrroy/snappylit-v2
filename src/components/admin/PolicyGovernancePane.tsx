import { useState, useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import {
  useDSTheme,
  DSCard,
  DSText,
  DSChip,
  DSBadge,
  DSButton,
  DSInput,
  DSSurface,
  DSDivider,
} from '@/design-system';
import {
  LOCKED_CORE_SUMMARY,
  proposePolicyFromEdits,
  type PolicyProposal,
  type PolicyTestSample,
} from '@/hooks/useGovernance';
import type {
  ActivePolicyDoc,
  PolicySettings,
  PolicyTone,
  PolicyVersion,
  ReadingLevel,
} from '@/types/article';

interface PolicyGovernancePaneProps {
  activePolicy: ActivePolicyDoc;
  versions: PolicyVersion[];
  isAdmin: boolean;
  userEmail: string;
  getIdToken: () => Promise<string>;
  onSaveVersion: (params: {
    settings: PolicySettings;
    adminInstructions: string;
    changeNote: string;
    userEmail: string;
    isAdmin: boolean;
  }) => Promise<string>;
  onRollback: (
    version: PolicyVersion,
    userEmail: string,
    isAdmin: boolean
  ) => Promise<string>;
  onTestPolicy: (params: {
    settings: PolicySettings;
    adminInstructions: string;
    idToken: string;
  }) => Promise<PolicyTestSample[]>;
}

const READING_LEVELS: ReadingLevel[] = [
  'grade 4',
  'grade 5',
  'grade 6',
  'grade 7',
  'grade 8',
];

const TONES: { value: PolicyTone; label: string }[] = [
  { value: 'calm_neutral', label: 'Calm & Neutral' },
  { value: 'curious_educator', label: 'Curious Educator' },
  { value: 'concise_wire', label: 'Concise Wire' },
];

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (next: number) => void;
}) {
  const { theme } = useDSTheme();

  return (
    <DSSurface
      variant="muted"
      radius="md"
      bordered
      style={{
        padding: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <DSText variant="caption" weight="semibold" tone="primary">
        {label}
      </DSText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        <DSButton
          label="−"
          variant="secondary"
          size="sm"
          onPress={() => onChange(Math.max(min, value - step))}
        />
        <DSText
          variant="caption"
          weight="bold"
          tone="primary"
          center
          style={{ minWidth: 44 }}
        >
          {value}
          {unit}
        </DSText>
        <DSButton
          label="+"
          variant="secondary"
          size="sm"
          onPress={() => onChange(Math.min(max, value + step))}
        />
      </View>
    </DSSurface>
  );
}

export function PolicyGovernancePane({
  activePolicy,
  versions,
  isAdmin,
  userEmail,
  getIdToken,
  onSaveVersion,
  onRollback,
  onTestPolicy,
}: PolicyGovernancePaneProps) {
  const { theme } = useDSTheme();
  const [settings, setSettings] = useState<PolicySettings>(activePolicy.settings);
  const [adminInstructions, setAdminInstructions] = useState(
    activePolicy.admin_instructions
  );
  const [changeNote, setChangeNote] = useState('');
  const [busy, setBusy] = useState<
    'save' | 'test' | 'rollback' | 'propose' | null
  >(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [testSamples, setTestSamples] = useState<PolicyTestSample[] | null>(
    null
  );
  const [proposal, setProposal] = useState<PolicyProposal | null>(null);

  useEffect(() => {
    setSettings(activePolicy.settings);
    setAdminInstructions(activePolicy.admin_instructions);
  }, [activePolicy]);

  const handleTest = async () => {
    setBusy('test');
    setFeedback(null);
    try {
      const token = await getIdToken();
      const samples = await onTestPolicy({
        settings,
        adminInstructions,
        idToken: token,
      });
      setTestSamples(samples);
      if (samples.length === 0) {
        setFeedback('No recent articles found to preview against.');
      }
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Failed to run policy test.'
      );
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    setBusy('save');
    setFeedback(null);
    try {
      const version = await onSaveVersion({
        settings,
        adminInstructions,
        changeNote,
        userEmail,
        isAdmin,
      });
      setChangeNote('');
      setFeedback(
        `Saved policy ${version}. It will apply on the next agent run (queued drafts unchanged).`
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to save policy.');
    } finally {
      setBusy(null);
    }
  };

  const handlePropose = async () => {
    setBusy('propose');
    setFeedback(null);
    try {
      const token = await getIdToken();
      const result = await proposePolicyFromEdits(token);
      setProposal(result);
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Failed to analyze editor edits.'
      );
    } finally {
      setBusy(null);
    }
  };

  const handleApplyProposal = () => {
    if (!proposal) return;
    setAdminInstructions((prev) =>
      prev.trim()
        ? `${prev.trim()}\n- ${proposal.proposedRule}`
        : `- ${proposal.proposedRule}`
    );
    setChangeNote(proposal.changeNote);
    setFeedback(
      'Proposed rule applied to Tier 2 Instructions below. Review and click "Save New Policy Version" to activate.'
    );
  };

  const handleRollback = async (version: PolicyVersion) => {
    setBusy('rollback');
    setFeedback(null);
    try {
      const newVer = await onRollback(version, userEmail, isAdmin);
      setFeedback(
        `Rolled back to ${version.version} (saved as ${newVer}) for future runs.`
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Rollback failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.canvas }}
      contentContainerStyle={{
        padding: theme.spacing.xxl,
        paddingBottom: theme.spacing.xxxl,
      }}
    >
      <View
        style={{
          maxWidth: theme.layout.contentMaxWidth,
          width: '100%',
          alignSelf: 'center',
          gap: theme.spacing.xl,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.md,
          }}
        >
          <View>
            <DSText variant="title3" weight="bold" tone="primary">
              Global Policy Settings
            </DSText>
            <DSText
              variant="caption"
              tone="secondary"
              style={{ marginTop: theme.spacing.xxs }}
            >
              Active: {activePolicy.active_version} · Changes apply on the next
              run and never alter drafts already in the queue.
            </DSText>
          </View>
          <DSBadge
            label={`Role: ${isAdmin ? 'Admin (All Tiers)' : 'Editor (Tier 1 Only)'}`}
            tone="accent"
          />
        </View>

        {/* Close the Loop: Learn from Editor Corrections */}
        <DSCard
          headerTitle="Pattern Analysis · Learn from Editor Corrections"
          headerSubtitle="Meta-Agent analyzes human edits & regenerations to propose durable Tier 2 policy updates"
          headerRight={
            <DSButton
              label="Analyze Recent Edits"
              variant="tinted"
              size="sm"
              pill
              loading={busy === 'propose'}
              disabled={busy !== null}
              onPress={handlePropose}
            />
          }
          padding="lg"
        >
          {proposal ? (
            <DSSurface
              radius="md"
              bordered
              style={{
                backgroundColor: theme.colors.accentSoft,
                borderColor: theme.colors.accentBorder,
                padding: theme.spacing.lg,
                gap: theme.spacing.md,
              }}
            >
              <DSText variant="body" weight="semibold" tone="primary">
                {proposal.observation}
              </DSText>
              <DSSurface
                variant="surface"
                radius="sm"
                bordered
                style={{ padding: theme.spacing.md }}
              >
                <DSText
                  variant="micro"
                  weight="bold"
                  tone="accent"
                  uppercase
                  style={{ marginBottom: theme.spacing.xxs }}
                >
                  Proposed Tier 2 Addition ({proposal.evidenceCount} reviewed
                  articles)
                </DSText>
                <DSText variant="body" tone="primary">
                  {proposal.proposedRule}
                </DSText>
              </DSSurface>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                  gap: theme.spacing.sm,
                }}
              >
                <DSButton
                  label="Dismiss"
                  variant="secondary"
                  size="sm"
                  onPress={() => setProposal(null)}
                />
                <DSButton
                  label="Preview & Apply to Tier 2"
                  variant="primary"
                  size="sm"
                  onPress={handleApplyProposal}
                />
              </View>
            </DSSurface>
          ) : (
            <DSText variant="caption" tone="secondary">
              Click &ldquo;Analyze Recent Edits&rdquo; to turn recurring human
              corrections into a versioned policy rule.
            </DSText>
          )}
        </DSCard>

        {/* Tier 1: Settings */}
        <DSCard
          headerTitle="Tier 1 · Policy Settings"
          headerSubtitle="Editable by any editor through structured controls"
          padding="lg"
        >
          <View style={{ gap: theme.spacing.lg }}>
            <View>
              <DSText
                variant="micro"
                weight="bold"
                tone="tertiary"
                uppercase
                style={{ marginBottom: theme.spacing.sm }}
              >
                Reading Level
              </DSText>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: theme.spacing.xs + 2,
                }}
              >
                {READING_LEVELS.map((lvl) => (
                  <DSChip
                    key={lvl}
                    label={lvl}
                    active={settings.reading_level === lvl}
                    onPress={() =>
                      setSettings({ ...settings, reading_level: lvl })
                    }
                  />
                ))}
              </View>
            </View>

            <View>
              <DSText
                variant="micro"
                weight="bold"
                tone="tertiary"
                uppercase
                style={{ marginBottom: theme.spacing.sm }}
              >
                Editorial Tone
              </DSText>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: theme.spacing.xs + 2,
                }}
              >
                {TONES.map((t) => (
                  <DSChip
                    key={t.value}
                    label={t.label}
                    active={settings.tone === t.value}
                    onPress={() => setSettings({ ...settings, tone: t.value })}
                  />
                ))}
              </View>
            </View>

            <View
              style={{ gap: theme.spacing.sm }}
              className="grid grid-cols-1 md:grid-cols-2"
            >
              <Stepper
                label="Target Headline Length"
                value={settings.target_headline_words}
                min={6}
                max={16}
                unit="w"
                onChange={(v) =>
                  setSettings({ ...settings, target_headline_words: v })
                }
              />
              <Stepper
                label="Target Summary Length"
                value={settings.target_summary_words}
                min={40}
                max={90}
                step={5}
                unit="w"
                onChange={(v) =>
                  setSettings({ ...settings, target_summary_words: v })
                }
              />
              <Stepper
                label="Max Stories per Topic"
                value={settings.max_per_topic}
                min={1}
                max={10}
                onChange={(v) =>
                  setSettings({ ...settings, max_per_topic: v })
                }
              />
              <Stepper
                label="Max Stories per Region"
                value={settings.max_per_region}
                min={1}
                max={10}
                onChange={(v) =>
                  setSettings({ ...settings, max_per_region: v })
                }
              />
            </View>
          </View>
        </DSCard>

        {/* Tier 2: Free-Text Instructions */}
        <DSCard
          headerTitle="Tier 2 · Free-Text Instructions"
          headerSubtitle="Admin role only · Appended to Summarizer brief after Tier 1 settings"
          headerRight={
            !isAdmin ? <DSBadge label="Admin Only (Locked)" tone="neutral" /> : undefined
          }
          padding="lg"
        >
          <DSInput
            value={adminInstructions}
            onChangeText={setAdminInstructions}
            editable={isAdmin}
            multiline
            placeholder="Optional custom editorial guidance (e.g., always define acronyms on first use)..."
            style={{ minHeight: 96, textAlignVertical: 'top' }}
          />
        </DSCard>

        {/* Tier 3: Locked Core */}
        <DSCard
          headerTitle="Tier 3 · Locked Core Rules"
          headerRight={<DSBadge label="Code Change Only" tone="neutral" />}
          padding="lg"
        >
          <DSText variant="footnote" tone="secondary">
            {LOCKED_CORE_SUMMARY}
          </DSText>
        </DSCard>

        {/* Preview & Save Version */}
        <DSCard headerTitle="Preview & Save Version" padding="lg">
          <View style={{ gap: theme.spacing.md }}>
            <DSInput
              value={changeNote}
              onChangeText={setChangeNote}
              placeholder="Change note (e.g., Lowered reading level to grade 5 for clarity)..."
            />

            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: theme.spacing.sm,
              }}
            >
              <DSButton
                label="Test Before Save"
                variant="secondary"
                size="md"
                loading={busy === 'test'}
                disabled={busy !== null}
                onPress={handleTest}
              />
              <DSButton
                label="Save New Policy Version"
                variant="primary"
                size="md"
                loading={busy === 'save'}
                disabled={busy !== null}
                onPress={handleSave}
              />
            </View>

            {feedback ? (
              <DSSurface
                radius="sm"
                bordered
                style={{
                  backgroundColor: theme.colors.accentSoft,
                  borderColor: theme.colors.accentBorder,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                }}
              >
                <DSText variant="caption" weight="medium" tone="accent">
                  {feedback}
                </DSText>
              </DSSurface>
            ) : null}

            {testSamples && testSamples.length > 0 ? (
              <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.sm }}>
                <DSDivider />
                <DSText variant="micro" weight="bold" tone="accent" uppercase>
                  Dry-Run Preview ({testSamples.length} sample articles · No drafts
                  modified)
                </DSText>
                {testSamples.map((sample) => (
                  <DSSurface
                    key={sample.id}
                    variant="muted"
                    radius="md"
                    bordered
                    style={{ padding: theme.spacing.md }}
                  >
                    <View
                      style={{ gap: theme.spacing.md }}
                      className="flex-col md:flex-row"
                    >
                      <DSSurface
                        variant="surface"
                        radius="sm"
                        bordered
                        style={{ flex: 1, padding: theme.spacing.md }}
                      >
                        <DSText
                          variant="micro"
                          weight="bold"
                          tone="tertiary"
                          uppercase
                          style={{ marginBottom: theme.spacing.xs }}
                        >
                          Current (Acc {sample.originalScores.accuracy} · Read{' '}
                          {sample.originalScores.readability})
                        </DSText>
                        <DSText
                          variant="caption"
                          weight="bold"
                          tone="primary"
                          style={{ marginBottom: theme.spacing.xs }}
                        >
                          {sample.originalHeadline}
                        </DSText>
                        <DSText variant="caption" tone="secondary">
                          {sample.originalSummary}
                        </DSText>
                      </DSSurface>

                      <DSSurface
                        variant="surface"
                        radius="sm"
                        bordered
                        style={{
                          flex: 1,
                          padding: theme.spacing.md,
                          borderColor: theme.colors.accentBorder,
                        }}
                      >
                        <DSText
                          variant="micro"
                          weight="bold"
                          tone="accent"
                          uppercase
                          style={{ marginBottom: theme.spacing.xs }}
                        >
                          Candidate (Acc {sample.candidateScores.accuracy} · Read{' '}
                          {sample.candidateScores.readability} ·{' '}
                          {sample.candidatePass ? 'PASS' : 'REVIEW'})
                        </DSText>
                        <DSText
                          variant="caption"
                          weight="bold"
                          tone="primary"
                          style={{ marginBottom: theme.spacing.xs }}
                        >
                          {sample.candidateHeadline}
                        </DSText>
                        <DSText variant="caption" tone="primary">
                          {sample.candidateSummary}
                        </DSText>
                      </DSSurface>
                    </View>
                  </DSSurface>
                ))}
              </View>
            ) : null}
          </View>
        </DSCard>

        {/* Version History & Rollback */}
        <DSCard headerTitle="Version History & Rollback" padding="lg">
          <View style={{ gap: theme.spacing.md }}>
            {versions.length === 0 ? (
              <DSText variant="caption" tone="tertiary">
                No saved policy versions yet. Saving a policy creates v1 and
                enables one-click rollback.
              </DSText>
            ) : (
              versions.map((ver) => {
                const isActive = ver.version === activePolicy.active_version;
                return (
                  <DSSurface
                    key={ver.id}
                    variant="muted"
                    radius="md"
                    bordered
                    style={{
                      padding: theme.spacing.md,
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: theme.spacing.md,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 200 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: theme.spacing.sm,
                        }}
                      >
                        <DSText variant="body" weight="bold" tone="primary">
                          {ver.version}
                        </DSText>
                        {isActive ? (
                          <DSBadge label="ACTIVE" tone="accent" />
                        ) : null}
                        <DSText variant="caption" tone="tertiary">
                          {ver.settings.reading_level} · ~
                          {ver.settings.target_summary_words}w ·{' '}
                          {ver.settings.tone}
                        </DSText>
                      </View>
                      <DSText
                        variant="caption"
                        tone="primary"
                        style={{ marginTop: theme.spacing.xs }}
                      >
                        {ver.change_note}
                      </DSText>
                      <DSText
                        variant="micro"
                        tone="tertiary"
                        style={{ marginTop: theme.spacing.xxs }}
                      >
                        {ver.created_by} ·{' '}
                        {ver.created_at.slice(0, 16).replace('T', ' ')}
                      </DSText>
                    </View>

                    {!isActive ? (
                      <DSButton
                        label="Rollback"
                        variant="secondary"
                        size="sm"
                        disabled={busy !== null}
                        onPress={() => handleRollback(ver)}
                      />
                    ) : null}
                  </DSSurface>
                );
              })
            )}
          </View>
        </DSCard>
      </View>
    </ScrollView>
  );
}
