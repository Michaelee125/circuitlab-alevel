import { useEffect } from 'react';
import { t } from '@circuitlab/i18n';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Modal,
  Segmented,
} from '@circuitlab/ui';
import { EXPERIMENTS } from '@circuitlab/teaching-engine';
import { useCircuitStore } from '../store';
import { LT } from './Localized';

export function ExperimentLibraryContent({ onDone }: { onDone?: () => void }) {
  const language = useCircuitStore((s) => s.language);
  const current = useCircuitStore((s) => s.experimentId);
  const startCircuit = useCircuitStore((s) => s.clearCircuit);
  const loadExperiment = useCircuitStore((s) => s.loadExperiment);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <Badge tone="accent">{t(language, "experiments.count", { n: EXPERIMENTS.length })}</Badge>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          {language === 'zh'
            ? '每个实验都可运行，并由同一物理引擎求解。'
            : 'Every experiment runs on the same physics solver — no canned animations.'}
        </span>
        <div style={{ flex: 1 }} />
        <Button
          size="sm"
          variant="ghost"
          icon="plus"
          onClick={() => {
            startCircuit();
            onDone?.();
          }}
        >
          {language === 'zh' ? '空白电路' : 'Blank circuit'}
        </Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
        {EXPERIMENTS.map((experiment) => (
          <div
            key={experiment.id}
            className="compare-card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              borderColor: current === experiment.id ? 'color-mix(in srgb, var(--accent) 45%, transparent)' : undefined,
            }}
          >
            <div className="compare-card-head" style={{ alignItems: 'flex-start' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <LT value={experiment.title} />
                <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>
                  <LT value={experiment.subtitle} />
                </span>
              </span>
              <Badge tone={experiment.level === 'A-Level' ? 'accent' : 'neutral'}>{experiment.level}</Badge>
            </div>
            <div style={{ padding: '9px 11px', fontSize: 11, lineHeight: 1.55, color: 'var(--muted)', flex: 1 }}>
              {(language === 'zh' ? experiment.instructions.zh : experiment.instructions.en)
                .slice(0, 2)
                .map((line, index) => (
                  <div key={index} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                    <Icon name="chevron-right" size={11} />
                    <span>{line}</span>
                  </div>
                ))}
            </div>
            <div style={{ padding: '0 11px 11px', display: 'flex', gap: 6, alignItems: 'center' }}>
              <Badge>{experiment.chart === 'none' ? 'explore' : experiment.chart}</Badge>
              <div style={{ flex: 1 }} />
              <Button
                size="sm"
                variant={current === experiment.id ? 'primary' : 'subtle'}
                icon="play"
                onClick={() => {
                  loadExperiment(experiment.id);
                  onDone?.();
                }}
              >
                {t(language, 'action.open')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SaveContent() {
  const language = useCircuitStore((s) => s.language);
  const saved = useCircuitStore((s) => s.saved);
  const saveCurrent = useCircuitStore((s) => s.saveCurrent);
  const loadSaved = useCircuitStore((s) => s.loadSaved);
  const deleteSaved = useCircuitStore((s) => s.deleteSaved);
  const importCircuit = useCircuitStore((s) => s.importCircuit);
  const exportCurrent = useCircuitStore((s) => s.exportCurrent);
  const shareCurrent = useCircuitStore((s) => s.shareCurrent);
  const doc = useCircuitStore((s) => s.doc);
  const setSheet = useCircuitStore((s) => s.setSheet);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        <Button variant="primary" icon="save" onClick={() => void saveCurrent()}>
          {t(language, 'action.save')}
        </Button>
        <Button icon="folder" onClick={() => void importCircuit()}>
          {t(language, 'action.import')}
        </Button>
        <Button icon="download" onClick={() => void exportCurrent()}>
          {t(language, 'action.export')}
        </Button>
        <Button icon="share" onClick={() => void shareCurrent()}>
          {t(language, 'action.share')}
        </Button>
        <Button icon="help" variant="ghost" onClick={() => setSheet('help')}>
          {t(language, 'help.title')}
        </Button>
      </div>
      <div className="field-hint" style={{ marginBottom: 10 }}>
        {doc.name} · {doc.components.length} components · {doc.wires.length} wires
      </div>
      {saved.length === 0 ? (
        <EmptyState icon="folder" title={t(language, 'save.empty')}>
          {language === 'zh'
            ? '保存的电路会存放在当前设备的 IndexedDB 中，不会上传到服务器。'
            : 'Saved circuits stay in this browser (IndexedDB). Nothing is uploaded.'}
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {saved.map((record) => (
            <div
              key={record.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                border: '1px solid var(--line)',
                borderRadius: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {record.name || 'Untitled circuit'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                  {new Date(record.updatedAt).toLocaleString()} · {record.doc.components.length} components
                </div>
              </div>
              <Button size="sm" icon="play" onClick={() => void loadSaved(record.id)}>
                {t(language, 'action.load')}
              </Button>
              <IconButton
                icon="trash"
                label={t(language, 'save.delete')}
                tone="danger"
                size={14}
                onClick={() => void deleteSaved(record.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HelpContent() {
  const language = useCircuitStore((s) => s.language);
  const theme = useCircuitStore((s) => s.theme);
  const quality = useCircuitStore((s) => s.quality);
  const setQuality = useCircuitStore((s) => s.setQuality);
  const setTheme = useCircuitStore((s) => s.setTheme);
  const showGrid = useCircuitStore((s) => s.showGrid);
  const setShowGrid = useCircuitStore((s) => s.setShowGrid);
  const showValues = useCircuitStore((s) => s.showValues);
  const setShowValues = useCircuitStore((s) => s.setShowValues);
  const pinned = useCircuitStore((s) => s.explainPinned);
  const toggleExplainPinned = useCircuitStore((s) => s.toggleExplainPinned);

  return (
    <div style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--ink-2)' }}>
      <p style={{ marginTop: 0 }}>{t(language, 'help.body')}</p>
      <div className="section-label">Shortcuts</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11.5 }}>
        <div><kbd>Del</kbd> / <kbd>⌫</kbd> — {t(language, 'action.delete')}</div>
        <div><kbd>R</kbd> — {t(language, 'action.rotate')}</div>
        <div><kbd>⌘</kbd>+<kbd>Z</kbd> — {t(language, 'action.undo')}</div>
        <div><kbd>F</kbd> — {t(language, 'action.fit')}</div>
        <div><kbd>Esc</kbd> — {language === 'zh' ? '取消连线' : 'cancel wiring'}</div>
        <div>{language === 'zh' ? '滚轮 / 双指 — 缩放' : 'Scroll / pinch — zoom'}</div>
      </div>
      <div className="section-label">Rendering</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Segmented
          value={quality}
          onChange={(value) => setQuality(value)}
          options={[
            { id: 'high', label: t(language, 'view.quality.high') },
            { id: 'medium', label: t(language, 'view.quality.medium') },
            { id: 'low', label: t(language, 'view.quality.low') },
          ]}
        />
        <button
          className={`btn btn-subtle btn-sm ${showGrid ? 'is-active' : ''}`}
          onClick={() => setShowGrid(!showGrid)}
        >
          {t(language, 'canvas.grid')}
        </button>
        <button
          className="btn btn-subtle btn-sm"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={13} />
          {theme === 'dark' ? t(language, 'view.dark') : t(language, 'view.light')}
        </button>
      </div>
      <div className="menu-divider" />
      <div className="menu-row" style={{ padding: '6px 0' }}>
        <span className="menu-row-label">
          {t(language, 'settings.values')}
          <span className="menu-row-hint">{t(language, 'settings.valuesHint')}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={showValues}
          aria-label={t(language, 'settings.values')}
          className={`toggle ${showValues ? 'is-on' : ''}`}
          onClick={() => setShowValues(!showValues)}
        >
          <span className="toggle-knob" />
        </button>
      </div>
      <div className="menu-row" style={{ padding: '6px 0' }}>
        <span className="menu-row-label">{t(language, 'explain.pin')}</span>
        <button
          type="button"
          role="switch"
          aria-checked={pinned}
          aria-label={t(language, 'explain.pin')}
          className={`toggle ${pinned ? 'is-on' : ''}`}
          onClick={toggleExplainPinned}
        >
          <span className="toggle-knob" />
        </button>
      </div>
      <div className="section-label">About</div>
      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)' }}>
        CircuitLab Physics v0.1.0 · Phase 1 (web). Physics: Modified Nodal Analysis with Newton
        iteration for non-linear elements; RC transients use the analytic Thévenin solution.
        Marking points in Explain are software-authored practice criteria, not official mark
        schemes. The same core packages power a WeChat mini-program adapter.
      </p>
    </div>
  );
}

export function Dialogs() {
  const language = useCircuitStore((s) => s.language);
  const sheet = useCircuitStore((s) => s.mobileSheet);
  const setSheet = useCircuitStore((s) => s.setSheet);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSheet('none');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSheet]);

  return (
    <>
      <Modal
        open={sheet === 'experiments'}
        onClose={() => setSheet('none')}
        title={t(language, 'experiments.library')}
        wide
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ExperimentLibraryContent onDone={() => setSheet('none')} />
        </div>
      </Modal>

      <Modal open={sheet === 'saved'} onClose={() => setSheet('none')} title={t(language, 'save.title')}>
        <SaveContent />
      </Modal>

      <Modal open={sheet === 'help'} onClose={() => setSheet('none')} title={t(language, 'help.title')}>
        <HelpContent />
      </Modal>
    </>
  );
}


export function ExperimentPanel() {
  const language = useCircuitStore((s) => s.language);
  const experimentId = useCircuitStore((s) => s.experimentId);
  const experiment = experimentId ? EXPERIMENTS.find((e) => e.id === experimentId) : null;
  const setSheet = useCircuitStore((s) => s.setSheet);
  const applyAction = useCircuitStore((s) => s.applyExperimentAction);

  if (!experiment) {
    return (
      <div className="panel-block">
        <div className="panel-head">
          <div className="panel-title">
            <Icon name="flask" size={15} />
            <span>{t(language, 'experiments.library')}</span>
          </div>
        </div>
        <div className="panel-body">
          <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 10 }}>
            {language === 'zh'
              ? '10 个可运行实验：从串联、并联到 LDR、内阻和电容充放电。'
              : 'Ten runnable experiments, from series circuits to LDRs, internal resistance and RC transients.'}
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setSheet('experiments')}>
            <Icon name="play" size={14} />
            {language === 'zh' ? '打开实验库' : 'Open experiment library'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-block">
      <div className="panel-head">
        <div className="panel-title">
          <Icon name="flask" size={15} />
          <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>
            {language === 'zh' ? experiment.title.zh : experiment.title.en}
          </span>
        </div>
        <Badge tone="accent">{experiment.level}</Badge>
      </div>
      <div className="panel-body">
        <div
          style={{
            fontSize: 11,
            color: 'var(--muted)',
            lineHeight: 1.5,
            marginBottom: 10,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {language === 'zh' ? experiment.subtitle.zh : experiment.subtitle.en}
        </div>
        {experiment.actions.length > 0 && (
          <>
            <div className="section-label" style={{ marginTop: 0 }}>{t(language, 'experiments.actions')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {experiment.actions.map((action) => (
                <button
                  key={action.id}
                  className="btn btn-subtle btn-sm"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => applyAction(action.id)}
                >
                  <Icon name="zap" size={13} />
                  <span style={{ whiteSpace: 'normal', textAlign: 'left' }}>
                    {language === 'zh' ? action.label.zh : action.label.en}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
