import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t, componentName } from '@circuitlab/i18n';
import type { Language } from '@circuitlab/circuit-core';
import { Icon, IconButton, Segmented } from '@circuitlab/ui';
import { getExperiment } from '@circuitlab/teaching-engine';
import { useCircuitStore } from '../store';

function Brand({ compact = false }: { compact?: boolean }) {
  const language = useCircuitStore((s) => s.language);
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
        {!compact && <span className="brand-sub">{t(language, 'app.tagline')}</span>}
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

/**
 * Three language options are always reachable: a segmented control on desktop
 * and a native select on phones (where the top bar has less room).
 */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const language = useCircuitStore((s) => s.language);
  const setLanguage = useCircuitStore((s) => s.setLanguage);
  if (compact) {
    return (
      <select
        className="lang-select"
        aria-label="Language"
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
      >
        <option value="en">English</option>
        <option value="zh">中文</option>
        <option value="bilingual">EN + 中文</option>
      </select>
    );
  }
  return (
    <Segmented
      value={language}
      ariaLabel="Language"
      onChange={(value) => setLanguage(value)}
      options={[
        { id: 'en', label: 'EN', title: 'English' },
        { id: 'zh', label: '中文', title: '中文' },
        { id: 'bilingual', label: 'EN/中', title: 'English + 中文' },
      ]}
    />
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

function MenuSwitch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const anchorRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const language = useCircuitStore((s) => s.language);
  const theme = useCircuitStore((s) => s.theme);
  const setTheme = useCircuitStore((s) => s.setTheme);
  const viewMode = useCircuitStore((s) => s.viewMode);
  const setViewMode = useCircuitStore((s) => s.setViewMode);
  const quality = useCircuitStore((s) => s.quality);
  const setQuality = useCircuitStore((s) => s.setQuality);
  const showValues = useCircuitStore((s) => s.showValues);
  const setShowValues = useCircuitStore((s) => s.setShowValues);
  const showGrid = useCircuitStore((s) => s.showGrid);
  const setShowGrid = useCircuitStore((s) => s.setShowGrid);
  const pinned = useCircuitStore((s) => s.explainPinned);
  const toggleExplainPinned = useCircuitStore((s) => s.toggleExplainPinned);
  const setSheet = useCircuitStore((s) => s.setSheet);

  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        top: rect.bottom + 10,
        right: Math.max(12, window.innerWidth - rect.right),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    const onDown = (event: PointerEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', measure);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="menu-anchor" ref={anchorRef}>
      <IconButton
        ref={buttonRef}
        icon="sliders"
        label={t(language, 'settings.title')}
        active={open}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      />
      {open &&
        createPortal(
          <div
            className="settings-popover settings-popover-fixed"
            role="dialog"
            aria-label={t(language, 'settings.title')}
            style={{ top: position.top, right: position.right }}
            onPointerDown={(event) => event.stopPropagation()}
          >
          <div className="menu-header">{t(language, 'settings.view')}</div>
          <div className="menu-row">
            <span className="menu-row-label">{t(language, 'settings.style')}</span>
            <Segmented
              value={viewMode}
              ariaLabel={t(language, 'settings.style')}
              onChange={(value) => setViewMode(value)}
              options={[
                { id: 'schematic', label: t(language, 'view.schematic').slice(0, 10) },
                { id: 'realistic', label: t(language, 'view.realistic').slice(0, 10) },
              ]}
            />
          </div>
          <div className="menu-row">
            <span className="menu-row-label">
              {t(language, 'settings.values')}
              <span className="menu-row-hint">{t(language, 'settings.valuesHint')}</span>
            </span>
            <MenuSwitch checked={showValues} onChange={setShowValues} label={t(language, 'settings.values')} />
          </div>
          <div className="menu-row">
            <span className="menu-row-label">{t(language, 'canvas.grid')}</span>
            <MenuSwitch checked={showGrid} onChange={setShowGrid} label={t(language, 'canvas.grid')} />
          </div>
          {useCircuitStore.getState().mode !== 'exam' && (
            <div className="menu-row">
              <span className="menu-row-label">{t(language, 'explain.pin')}</span>
              <MenuSwitch checked={pinned} onChange={toggleExplainPinned} label={t(language, 'explain.pin')} />
            </div>
          )}
          <div className="menu-row">
            <span className="menu-row-label">{t(language, 'view.quality')}</span>
            <Segmented
              value={quality}
              ariaLabel={t(language, 'view.quality')}
              onChange={(value) => setQuality(value)}
              options={[
                { id: 'high', label: t(language, 'view.quality.high') },
                { id: 'medium', label: t(language, 'view.quality.medium') },
                { id: 'low', label: t(language, 'view.quality.low') },
              ]}
            />
          </div>
          <div className="menu-row">
            <span className="menu-row-label">{t(language, 'view.theme')}</span>
            <Segmented
              value={theme}
              ariaLabel={t(language, 'view.theme')}
              onChange={(value) => setTheme(value)}
              options={[
                { id: 'dark', label: t(language, 'view.dark') },
                { id: 'light', label: t(language, 'view.light') },
              ]}
            />
          </div>
          <div className="menu-divider" />
          <div className="menu-header">{t(language, 'settings.data')}</div>
          <button className="menu-action" onClick={() => { close(); void useCircuitStore.getState().saveCurrent(); }}>
            <Icon name="save" size={15} /> {t(language, 'action.save')}
          </button>
          <button className="menu-action" onClick={() => { close(); setSheet('saved'); }}>
            <Icon name="folder" size={15} /> {t(language, 'action.open')}
          </button>
          <button className="menu-action" onClick={() => { close(); void useCircuitStore.getState().exportCurrent(); }}>
            <Icon name="download" size={15} /> {t(language, 'action.export')}
          </button>
          <button className="menu-action" onClick={() => { close(); setSheet('help'); }}>
            <Icon name="help" size={15} /> {t(language, 'help.title')}
          </button>
          </div>,
          document.body,
        )}
    </div>
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
      <LanguagePicker />
      <div className="topbar-group">
        <ThemeToggle />
        <SettingsMenu />
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
  const setSheet = useCircuitStore((s) => s.setSheet);
  const theme = useCircuitStore((s) => s.theme);
  const setTheme = useCircuitStore((s) => s.setTheme);
  const experimentId = useCircuitStore((s) => s.experimentId);
  const experiment = experimentId ? getExperiment(experimentId) : null;

  return (
    <header className="mobile-topbar">
      <Brand compact />
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
      <div style={{ flex: 1 }} />
      <LanguagePicker compact />
      <div className="mobile-actions">
        <IconButton
          icon="flask"
          label={t(language, 'experiments.library')}
          size={16}
          onClick={() => setSheet('experiments')}
        />
        <IconButton
          icon={theme === 'dark' ? 'moon' : 'sun'}
          label={t(language, 'view.theme')}
          size={16}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        />
        <IconButton icon="menu" label={t(language, 'save.title')} size={16} onClick={() => setSheet('saved')} />
      </div>
      {experiment && <span style={{ display: 'none' }}>{experiment.title.en}</span>}
    </header>
  );
}
