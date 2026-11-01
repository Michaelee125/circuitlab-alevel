import { t, UI_LANGUAGES, componentName } from '@circuitlab/i18n';
import type { Language } from '@circuitlab/circuit-core';
import { Icon, IconButton, Segmented } from '@circuitlab/ui';
import { getExperiment } from '@circuitlab/teaching-engine';
import { useCircuitStore } from '../store';

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <div className="brand-mark">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8h4l2 3h3l2-3h3" />
          <path d="M3 16h4l2-3h3l2 3h3" />
          <circle cx="9" cy="8" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="15" cy="16" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <div className="brand-text">
        <span className="brand-title">CircuitLab</span>
        {!compact && <span className="brand-sub">{t('en', 'app.tagline')}</span>}
      </div>
    </div>
  );
}

function ModeSwitch({ compact = false }: { compact?: boolean }) {
  const mode = useCircuitStore((s) => s.mode);
  const language = useCircuitStore((s) => s.language);
  const setMode = useCircuitStore((s) => s.setMode);
  return (
    <div className={compact ? 'mobile-mode' : undefined}>
      <Segmented
        value={mode}
        ariaLabel="Mode"
        onChange={(value) => setMode(value)}
        options={[
          { id: 'explore', label: t(language, 'mode.explore') },
          { id: 'guided', label: t(language, 'mode.guided') },
          { id: 'exam', label: t(language, 'mode.exam') },
        ]}
      />
    </div>
  );
}

function LanguageControl() {
  const language = useCircuitStore((s) => s.language);
  const setLanguage = useCircuitStore((s) => s.setLanguage);
  return (
    <div className="hide-md">
      <Segmented
        value={language}
        ariaLabel="Language"
        onChange={(value) => setLanguage(value)}
        options={UI_LANGUAGES.map((option) => ({
          id: option.id,
          label: option.id === 'en' ? 'EN' : option.id === 'zh' ? '中文' : 'EN/中',
          title: option.label,
        }))}
      />
    </div>
  );
}

function ThemeToggle() {
  const theme = useCircuitStore((s) => s.theme);
  const language = useCircuitStore((s) => s.language);
  const setTheme = useCircuitStore((s) => s.setTheme);
  return (
    <IconButton
      icon={theme === 'dark' ? 'moon' : 'sun'}
      label={`${t(language, 'view.theme')}: ${theme === 'dark' ? t(language, 'view.dark') : t(language, 'view.light')}`}
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    />
  );
}

export function TopBar() {
  const language = useCircuitStore((s) => s.language);
  const experimentId = useCircuitStore((s) => s.experimentId);
  const experiment = experimentId ? getExperiment(experimentId) : null;
  const setSheet = useCircuitStore((s) => s.setSheet);
  const bottomOpen = useCircuitStore((s) => s.bottomOpen);
  const setBottomOpen = useCircuitStore((s) => s.setBottomOpen);
  const selectionId = useCircuitStore((s) => s.selectionId);
  const doc = useCircuitStore((s) => s.doc);
  const selection = doc.components.find((c) => c.id === selectionId);

  return (
    <header className="topbar">
      <Brand />
      <div className="topbar-divider" />
      <ModeSwitch />
      <button
        className="btn btn-subtle btn-sm"
        onClick={() => setSheet('experiments')}
        style={{ maxWidth: 230, overflow: 'hidden' }}
        title={t(language, 'experiments.library')}
      >
        <Icon name="flask" size={14} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {experiment ? (language === 'zh' ? experiment.title.zh : experiment.title.en) : t(language, 'experiments.library')}
        </span>
      </button>
      {selection && (
        <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          {selection.label ?? componentName(language, selection.kind)}
        </span>
      )}
      <div className="topbar-spacer" />
      <LanguageControl />
      <div className="topbar-group">
        <ThemeToggle />
        <IconButton
          icon="chart"
          label={t(language, 'panel.graph')}
          active={bottomOpen}
          onClick={() => setBottomOpen(!bottomOpen)}
          badge={!bottomOpen && experiment?.chart !== undefined && experiment.chart !== 'none'}
        />
        <IconButton icon="save" label={t(language, 'action.save')} onClick={() => void useCircuitStore.getState().saveCurrent()} />
        <IconButton icon="folder" label={t(language, 'save.title')} onClick={() => setSheet('saved')} />
        <IconButton icon="help" label={t(language, 'help.title')} onClick={() => setSheet('help')} />
      </div>
    </header>
  );
}

export function MobileTopBar() {
  const language = useCircuitStore((s) => s.language);
  const mode = useCircuitStore((s) => s.mode);
  const setMode = useCircuitStore((s) => s.setMode);
  const theme = useCircuitStore((s) => s.theme);
  const setTheme = useCircuitStore((s) => s.setTheme);
  const setSheet = useCircuitStore((s) => s.setSheet);
  const experimentId = useCircuitStore((s) => s.experimentId);
  const experiment = experimentId ? getExperiment(experimentId) : null;
  const cycleLanguage = () => {
    const next: Language = language === 'en' ? 'zh' : language === 'zh' ? 'bilingual' : 'en';
    useCircuitStore.getState().setLanguage(next);
  };

  return (
    <header className="mobile-topbar">
      <Brand compact />
      <div style={{ flex: 1 }} />
      <div className="mobile-mode">
        <Segmented
          value={mode}
          ariaLabel="Mode"
          onChange={(value) => setMode(value)}
          options={[
            { id: 'explore', label: language === 'zh' ? '探索' : 'Explore' },
            { id: 'guided', label: language === 'zh' ? '引导' : 'Guided' },
            { id: 'exam', label: language === 'zh' ? '考试' : 'Exam' },
          ]}
        />
      </div>
      <IconButton icon="flask" label={t(language, 'experiments.library')} size={16} onClick={() => setSheet('experiments')} />
      <IconButton
        icon="globe"
        label={t(language, 'view.language')}
        size={16}
        onClick={cycleLanguage}
      />
      <IconButton
        icon={theme === 'dark' ? 'moon' : 'sun'}
        label={t(language, 'view.theme')}
        size={16}
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      />
      <IconButton icon="menu" label={t(language, 'save.title')} size={16} onClick={() => setSheet('saved')} />
      {experiment && <span style={{ display: 'none' }}>{experiment.title.en}</span>}
    </header>
  );
}
