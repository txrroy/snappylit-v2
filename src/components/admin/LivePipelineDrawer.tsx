import { useState, useRef } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import {
  useDSTheme,
  DSCard,
  DSText,
  DSBadge,
  DSButton,
  DSInput,
  DSSurface,
  DSSegmentedControl,
} from '@/design-system';
import { getApiBaseUrl } from '@/config/appConfig';

interface LivePipelineDrawerProps {
  visible: boolean;
  getIdToken: () => Promise<string>;
  onClose: () => void;
  onOpenArticle: (id: string) => void;
}

type PipelineMode = 'single-url' | 'edition';

interface ClaimEvent {
  claim: string;
  evidence: string;
  supported: boolean;
  isRetry?: boolean;
}

interface StageState {
  status: 'idle' | 'running' | 'retry' | 'done' | 'error';
  message: string;
}

export function LivePipelineDrawer({
  visible,
  getIdToken,
  onClose,
  onOpenArticle,
}: LivePipelineDrawerProps) {
  const { theme } = useDSTheme();
  const [mode, setMode] = useState<PipelineMode>('single-url');
  const [urlInput, setUrlInput] = useState('');
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [agent1, setAgent1] = useState<StageState>({
    status: 'idle',
    message: 'Waiting to scan feeds or URL...',
  });
  const [agent2, setAgent2] = useState<StageState>({
    status: 'idle',
    message: 'Waiting for Agent 1 handoff...',
  });
  const [agent3, setAgent3] = useState<StageState>({
    status: 'idle',
    message: 'Waiting for Agent 2 draft...',
  });

  const [draftPreview, setDraftPreview] = useState<{
    headline: string;
    summary: string;
    isRetry?: boolean;
  } | null>(null);
  const [claims, setClaims] = useState<ClaimEvent[]>([]);
  const [retryNote, setRetryNote] = useState<string | null>(null);
  const [finalScores, setFinalScores] = useState<{
    pass: boolean;
    accuracy: number;
    neutrality: number;
    safety: number;
    readability: number;
  } | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  if (!visible) return null;

  const resetState = () => {
    setErrorMsg(null);
    setDraftPreview(null);
    setClaims([]);
    setRetryNote(null);
    setFinalScores(null);
    setSavedIds([]);
    setAgent1({ status: 'idle', message: 'Initializing...' });
    setAgent2({ status: 'idle', message: 'Waiting for Agent 1 handoff...' });
    setAgent3({ status: 'idle', message: 'Waiting for Agent 2 draft...' });
  };

  const handleRun = async () => {
    if (mode === 'single-url' && !urlInput.trim()) {
      setErrorMsg('Please enter an article URL to ingest live.');
      return;
    }

    resetState();
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = await getIdToken();
      const response = await fetch(`${getApiBaseUrl()}/api/pipeline-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode,
          url: mode === 'single-url' ? urlInput.trim() : undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const text = await response.text();
        throw new Error(text || `Pipeline stream failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const chunk of lines) {
          const dataLine = chunk
            .split('\n')
            .find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          const evt = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;

          if (evt.type === 'agent1_start' || evt.type === 'agent1_progress') {
            setAgent1({
              status: 'running',
              message: String(evt.message || 'Scanning...'),
            });
          } else if (evt.type === 'agent1_done') {
            const stories = (evt.stories as { title: string }[]) || [];
            setAgent1({
              status: 'done',
              message: `Picked ${evt.count} story/stories: ${stories.map((s) => s.title).join(' · ')}`,
            });
          } else if (evt.type === 'agent2_start') {
            setAgent2({
              status: 'running',
              message: String(evt.message || 'Drafting summary...'),
            });
          } else if (evt.type === 'agent2_done') {
            setAgent2({
              status: 'done',
              message: evt.isRetry
                ? 'Self-corrected draft generated from Judge critique.'
                : 'Drafted Grade-6 summary.',
            });
            setDraftPreview({
              headline: String(evt.headline || ''),
              summary: String(evt.summary || ''),
              isRetry: Boolean(evt.isRetry),
            });
          } else if (evt.type === 'agent3_start') {
            setAgent3({
              status: 'running',
              message: String(evt.message || 'Auditing claims...'),
            });
          } else if (evt.type === 'agent3_claim') {
            setClaims((prev) => [
              ...prev,
              {
                claim: String(evt.claim || ''),
                evidence: String(evt.evidence || ''),
                supported: Boolean(evt.supported),
                isRetry: Boolean(evt.isRetry),
              },
            ]);
          } else if (evt.type === 'agent3_retry') {
            setAgent3({
              status: 'retry',
              message: String(evt.message || 'Sending critique back to Agent 2...'),
            });
            setAgent2({
              status: 'running',
              message: 'Re-drafting based on Agent 3 Judge critique...',
            });
            setRetryNote(String(evt.reason || ''));
          } else if (evt.type === 'agent3_done') {
            const scores = evt.scores as {
              accuracy: number;
              neutrality: number;
              safety: number;
              readability: number;
            };
            setAgent3({
              status: 'done',
              message: String(evt.reasoning || 'Audit complete.'),
            });
            setFinalScores({
              pass: Boolean(evt.pass),
              ...scores,
            });
          } else if (evt.type === 'complete') {
            setSavedIds((evt.savedIds as string[]) || []);
          } else if (evt.type === 'error') {
            setErrorMsg(String(evt.message || 'Pipeline error'));
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setErrorMsg(
          err instanceof Error ? err.message : 'Unable to stream pipeline'
        );
      }
    } finally {
      setRunning(false);
    }
  };

  const getStageBadge = (status: StageState['status']) => {
    if (status === 'running') return { label: 'Running', tone: 'accent' as const };
    if (status === 'retry') return { label: 'Self-Correcting', tone: 'warning' as const };
    if (status === 'done') return { label: 'Complete', tone: 'success' as const };
    if (status === 'error') return { label: 'Error', tone: 'danger' as const };
    return { label: 'Idle', tone: 'neutral' as const };
  };

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        flexDirection: 'row',
        justifyContent: 'flex-end',
      }}
    >
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: theme.colors.backdrop }}
      />

      <View
        style={[
          theme.shadows.popover,
          {
            backgroundColor: theme.colors.canvas,
            borderLeftWidth: theme.layout.borderWidth,
            borderLeftColor: theme.colors.borderDefault,
            height: '100%',
            maxWidth: theme.layout.drawerMaxWidth,
            flexDirection: 'column',
          },
        ]}
        className="w-full md:w-[70%] lg:w-[58%]"
      >
        {/* Toolbar */}
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderBottomWidth: theme.layout.borderWidth,
            borderBottomColor: theme.colors.borderSubtle,
            paddingHorizontal: theme.spacing.xl,
            paddingVertical: theme.spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View>
            <DSText variant="headline" weight="bold" tone="primary">
              Watch Agents Work
            </DSText>
            <DSText variant="caption" tone="secondary">
              Live 3-Agent SSE Pipeline · Fetcher → Summarizer → Judge
            </DSText>
          </View>
          <DSButton
            label="Close"
            variant="secondary"
            size="sm"
            pill
            onPress={() => {
              abortRef.current?.abort();
              onClose();
            }}
          />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: theme.spacing.xl,
            gap: theme.spacing.lg,
          }}
        >
          {/* Controls */}
          <DSCard headerTitle="Pipeline Trigger" padding="lg">
            <View style={{ gap: theme.spacing.md }}>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: theme.spacing.md,
                }}
              >
                <DSSegmentedControl
                  options={[
                    { id: 'single-url', label: 'Ingest Single URL Live' },
                    { id: 'edition', label: 'Run Live Edition Sample' },
                  ]}
                  value={mode}
                  onChange={setMode}
                />

                <DSButton
                  label={running ? 'Running Pipeline...' : 'Run Live Pipeline'}
                  variant="accent"
                  size="md"
                  pill
                  loading={running}
                  disabled={running}
                  onPress={handleRun}
                />
              </View>

              {mode === 'single-url' ? (
                <DSInput
                  value={urlInput}
                  onChangeText={setUrlInput}
                  placeholder="https://www.reuters.com/world/..."
                  autoCapitalize="none"
                />
              ) : null}

              {errorMsg ? (
                <DSSurface
                  radius="sm"
                  bordered
                  style={{
                    backgroundColor: theme.colors.tones.danger.bg,
                    borderColor: theme.colors.tones.danger.border,
                    padding: theme.spacing.md,
                  }}
                >
                  <DSText variant="caption" tone="danger">
                    {errorMsg}
                  </DSText>
                </DSSurface>
              ) : null}
            </View>
          </DSCard>

          {/* Stage 1: Fetcher */}
          <DSCard
            headerTitle="Agent 1 · RSS Fetcher & Clustering"
            headerRight={<DSBadge {...getStageBadge(agent1.status)} dot />}
            padding="lg"
          >
            <DSText variant="body" tone="secondary">
              {agent1.message}
            </DSText>
          </DSCard>

          {/* Stage 2: Summarizer */}
          <DSCard
            headerTitle="Agent 2 · Grade-6 Summarizer"
            headerRight={<DSBadge {...getStageBadge(agent2.status)} dot />}
            padding="lg"
          >
            <DSText variant="body" tone="secondary">
              {agent2.message}
            </DSText>
            {draftPreview ? (
              <DSSurface
                variant="muted"
                radius="md"
                bordered
                style={{
                  padding: theme.spacing.md,
                  marginTop: theme.spacing.md,
                  gap: theme.spacing.xs,
                }}
              >
                {draftPreview.isRetry ? (
                  <DSBadge label="Self-Corrected Draft" tone="accent" />
                ) : null}
                <DSText variant="subhead" weight="bold" tone="primary">
                  {draftPreview.headline}
                </DSText>
                <DSText variant="body" tone="secondary">
                  {draftPreview.summary}
                </DSText>
              </DSSurface>
            ) : null}
          </DSCard>

          {/* Autonomous Self-Correction Loop Banner */}
          {retryNote ? (
            <DSSurface
              radius="md"
              bordered
              style={{
                backgroundColor: theme.colors.tones.warning.bg,
                borderColor: theme.colors.tones.warning.border,
                padding: theme.spacing.lg,
                gap: theme.spacing.xs,
              }}
            >
              <DSText variant="caption" weight="bold" tone="warning" uppercase>
                ↻ Autonomous Self-Correction Loop Triggered
              </DSText>
              <DSText variant="footnote" tone="primary">
                Agent 3 rejected the initial draft and sent critique back to
                Agent 2: {retryNote}
              </DSText>
            </DSSurface>
          ) : null}

          {/* Stage 3: Judge */}
          <DSCard
            headerTitle="Agent 3 · Quality Judge & Claim Grounding"
            headerRight={<DSBadge {...getStageBadge(agent3.status)} dot />}
            padding="lg"
          >
            <DSText variant="body" tone="secondary">
              {agent3.message}
            </DSText>

            {claims.length > 0 ? (
              <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
                <DSText variant="micro" weight="bold" tone="tertiary" uppercase>
                  Claim-by-Claim Verification
                </DSText>
                {claims.map((c, idx) => (
                  <DSSurface
                    key={`${idx}-${c.claim.slice(0, 15)}`}
                    variant="muted"
                    radius="sm"
                    bordered
                    style={{
                      padding: theme.spacing.md,
                      gap: theme.spacing.xs,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: theme.spacing.sm,
                      }}
                    >
                      <DSText
                        variant="caption"
                        weight="semibold"
                        tone="primary"
                        style={{ flex: 1 }}
                      >
                        {c.claim}
                      </DSText>
                      <DSBadge
                        label={c.supported ? 'Grounded' : 'Unsupported'}
                        tone={c.supported ? 'success' : 'danger'}
                      />
                    </View>
                    <DSText variant="micro" tone="tertiary">
                      Evidence: {c.evidence}
                    </DSText>
                  </DSSurface>
                ))}
              </View>
            ) : null}

            {finalScores ? (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: theme.spacing.sm,
                  marginTop: theme.spacing.md,
                }}
              >
                <DSBadge
                  label={finalScores.pass ? 'AUTO-PASS' : 'NEEDS REVIEW'}
                  tone={finalScores.pass ? 'success' : 'warning'}
                />
                <DSBadge
                  label={`Accuracy ${finalScores.accuracy}`}
                  tone={finalScores.accuracy >= 85 ? 'success' : 'warning'}
                />
                <DSBadge
                  label={`Safety ${finalScores.safety}`}
                  tone="success"
                />
                <DSBadge
                  label={`Readability ${finalScores.readability}`}
                  tone="accent"
                />
              </View>
            ) : null}
          </DSCard>

          {savedIds.length > 0 ? (
            <View style={{ alignItems: 'flex-end' }}>
              <DSButton
                label="Open Saved Draft in Reader →"
                variant="primary"
                size="md"
                pill
                onPress={() => {
                  onClose();
                  onOpenArticle(savedIds[0]);
                }}
              />
            </View>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}
