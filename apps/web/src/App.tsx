import { useEffect } from 'react';
import { Icon } from '@circuitlab/ui';
import { t } from '@circuitlab/i18n';
import { TopBar } from './components/TopBar';
import { Palette } from './components/Palette';
import { ExperimentPanel, Dialogs } from './components/Dialogs';
import { CircuitCanvas } from './components/CircuitCanvas';
import { BottomDock } from './components/BottomDock';
import { RightRail } from './components/RightRail';
import { MobileShell } from './components/Mobile';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useCircuitStore, useSolution } from './store';

export default function App() {
  const theme = useCircuitStore((s) => s.theme);
  const language = useCircuitStore((s) => s.language);
  const bottomOpen = useCircuitStore((s) => s.bottomOpen);
  const toast = useCircuitStore((s) => s.toast);
  const isMobile = useMediaQuery('(max-width: 900px)');

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    root.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#050b16' : '#eef6fd');
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh' : 'en';
  }, [language]);

  useEffect(() => {
    void useCircuitStore.getState().refreshSaved();
  }, []);

  useEffect(() => {
    const onSaveShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void useCircuitStore.getState().saveCurrent();
      }
    };
    window.addEventListener('keydown', onSaveShortcut);
    return () => window.removeEventListener('keydown', onSaveShortcut);
  }, []);

  return (
    <div className="app-shell">
      {isMobile ? (
        <MobileShell />
      ) : (
        <div className="desktop-shell">
          <TopBar />
          <div className="workspace">
            <aside className="sidebar">
              <Palette />
              <ExperimentPanel />
            </aside>
            <main className="stage">
              <CircuitCanvas dockOpen={bottomOpen} />
              <BottomDock />
            </main>
            <aside className="right-rail">
              <RightRail />
            </aside>
          </div>
        </div>
      )}
      <Dialogs />

      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <Icon name={toast.kind === 'ok' ? 'check' : 'info'} size={15} />
          <span>{toast.message}</span>
        </div>
      )}

      <span style={{ display: 'none' }} aria-hidden="true">
        {t(language, 'app.subtitle')}
      </span>
      <CircuitDiagnostics />
    </div>
  );
}

/**
 * Invisible diagnostics element. It exposes the *already computed* circuit state
 * for automated smoke tests and for the deployment probe, without any hidden
 * business logic.
 */
function CircuitDiagnostics() {
  const doc = useCircuitStore((s) => s.doc);
  const solution = useSolution();
  const highlight = useCircuitStore((s) => s.highlightIds);
  const experimentId = useCircuitStore((s) => s.experimentId);
  const viewMode = useCircuitStore((s) => s.viewMode);
  const language = useCircuitStore((s) => s.language);
  const refDoc = useCircuitStore((s) => s.refDoc);
  const view = useCircuitStore((s) => s.view);
  const selectionId = useCircuitStore((s) => s.selectionId);
  const selectedWireId = useCircuitStore((s) => s.selectedWireId);
  const sheet = useCircuitStore((s) => s.mobileSheet);
  const showValues = useCircuitStore((s) => s.showValues);
  return (
    <div
      hidden
      data-testid="circuit-state"
      data-components={doc.components.length}
      data-wires={doc.wires.length}
      data-status={solution.status}
      data-current={solution.totalCurrent ?? ''}
      data-resistance={solution.totalResistance ?? ''}
      data-highlight={highlight.join(',')}
      data-experiment={experimentId ?? ''}
      data-view-mode={viewMode}
      data-language={language}
      data-has-baseline={refDoc ? 'true' : 'false'}
      data-view-x={view.x}
      data-view-y={view.y}
      data-zoom={view.zoom}
      data-selection={selectionId ?? ''}
      data-selected-wire={selectedWireId ?? ''}
      data-wire-route={selectedWireId ? (doc.wires.find((w) => w.id === selectedWireId)?.route ? 'manual' : 'auto') : 'none'}
      data-sheet={sheet}
      data-show-values={showValues ? 'true' : 'false'}
    />
  );
}
