import { useState } from 'react';
import { Icon, IconButton, Segmented } from '@circuitlab/ui';
import { t } from '@circuitlab/i18n';
import { useCircuitStore } from '../store';
import { CircuitCanvas } from './CircuitCanvas';
import { MobileTopBar } from './TopBar';
import { Palette } from './Palette';
import { Inspector, ExplainPanel, ComparePanel, GuidedPanel } from './RightRail';
import { ChartView, Measurements, ExperimentActions } from './BottomDock';

const SHEET_TITLES: Record<string, string> = {
  palette: 'panel.components',
  inspector: 'panel.properties',
  explain: 'panel.explain',
  compare: 'panel.compare',
  chart: 'panel.graph',
  guided: 'mode.guided',
};

function ChartSheet() {
  const [tab, setTab] = useState<'chart' | 'measure'>('chart');
  const language = useCircuitStore((s) => s.language);
  return (
    <div>
      <Segmented
        value={tab}
        ariaLabel="Bottom panel"
        onChange={setTab}
        options={[
          { id: 'chart', label: t(language, 'panel.graph') },
          { id: 'measure', label: t(language, 'panel.measure') },
        ]}
      />
      <div style={{ height: tab === 'chart' ? 330 : 360, display: 'flex', marginTop: 10 }}>
        {tab === 'chart' ? <ChartView /> : <Measurements />}
      </div>
      <div style={{ marginTop: 10 }}><ExperimentActions compact /></div>
    </div>
  );
}

function SheetBody({ kind }: { kind: string }) {
  const mode = useCircuitStore((s) => s.mode);
  switch (kind) {
    case 'palette':
      return <Palette bare />;
    case 'inspector':
      return <Inspector />;
    case 'compare':
      return <ComparePanel />;
    case 'chart':
      return <ChartSheet />;
    case 'guided':
      return <GuidedPanel />;
    case 'explain':
    default:
      return mode === 'guided' ? <GuidedPanel /> : <ExplainPanel />;
  }
}

export function MobileShell() {
  const sheet = useCircuitStore((s) => s.mobileSheet);
  const setSheet = useCircuitStore((s) => s.setSheet);
  const language = useCircuitStore((s) => s.language);
  const mode = useCircuitStore((s) => s.mode);

  const tabs = [
    { id: 'palette', label: t(language, 'panel.components'), icon: 'circuit' as const },
    { id: 'inspector', label: t(language, 'panel.properties'), icon: 'sliders' as const },
    { id: 'explain', label: mode === 'guided' ? t(language, 'mode.guided') : t(language, 'panel.explain'), icon: 'zap' as const },
    { id: 'compare', label: t(language, 'panel.compare'), icon: 'layers' as const },
    { id: 'chart', label: t(language, 'panel.graph'), icon: 'chart' as const },
  ];

  const activeSheet = sheet !== 'none' && !['experiments', 'saved', 'help'].includes(sheet);
  const titleKey = SHEET_TITLES[sheet] ?? 'panel.explain';

  return (
    <div className="mobile-shell">
      <MobileTopBar />
      <div className="mobile-stage">
        <CircuitCanvas compact />
      </div>
      <nav className="mobile-tabbar" aria-label="Sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`mobile-tab ${sheet === tab.id ? 'is-active' : ''}`}
            onClick={() => setSheet(sheet === tab.id ? 'none' : (tab.id as typeof sheet))}
          >
            <Icon name={tab.icon} size={19} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {activeSheet && (
        <div className="sheet-backdrop" onClick={() => setSheet('none')}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-head">
              <span style={{ fontSize: 13, fontWeight: 650 }}>{t(language, titleKey)}</span>
              <IconButton icon="x" label={t(language, 'action.close')} size={16} onClick={() => setSheet('none')} />
            </div>
            <div className="sheet-body">
              <SheetBody kind={sheet} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
