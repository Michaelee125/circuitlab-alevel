import type { ComponentKind } from '@circuitlab/circuit-core';
import { COMPONENT_CATEGORIES, COMPONENT_DEFS, COMPONENT_KINDS } from '@circuitlab/circuit-core';
import { componentName, t } from '@circuitlab/i18n';
import { Icon, Panel } from '@circuitlab/ui';
import { useCircuitStore } from '../store';

function Glyph({ kind }: { kind: ComponentKind }) {
  const stroke = 'currentColor';
  const common = {
    fill: 'none',
    stroke,
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg width="48" height="30" viewBox="0 0 48 30" className="palette-glyph" aria-hidden="true">
      {kind === 'cell' && (
        <>
          <path d="M2 15h13M33 15h13" {...common} />
          <path d="M15 8v14" {...common} strokeWidth={2} />
          <path d="M33 11v8" {...common} strokeWidth={2} />
        </>
      )}
      {kind === 'battery' && (
        <>
          <path d="M2 15h10M36 15h10" {...common} />
          <path d="M12 9v12M18 11v8M26 9v12M32 11v8" {...common} strokeWidth={1.8} />
        </>
      )}
      {kind === 'resistor' && (
        <>
          <path d="M2 15h9M37 15h9" {...common} />
          <rect x="11" y="9" width="26" height="12" rx="1.5" {...common} />
        </>
      )}
      {kind === 'variable-resistor' && (
        <>
          <path d="M2 15h9M37 15h9" {...common} />
          <rect x="11" y="9" width="26" height="12" rx="1.5" {...common} />
          <path d="M16 25l16-16M32 9l1.5 1M32 9l-1 1.5" {...common} />
        </>
      )}
      {kind === 'lamp' && (
        <>
          <path d="M2 15h13M33 15h13" {...common} />
          <circle cx="24" cy="15" r="8.5" {...common} />
          <path d="M19 10l10 10M29 10L19 20" {...common} />
        </>
      )}
      {kind === 'switch' && (
        <>
          <path d="M2 15h14M32 15h14" {...common} />
          <circle cx="16" cy="15" r="1.7" fill={stroke} stroke="none" />
          <circle cx="32" cy="15" r="1.7" fill={stroke} stroke="none" />
          <path d="M16 15l13-9" {...common} strokeWidth={2} />
        </>
      )}
      {kind === 'ammeter' && (
        <>
          <path d="M2 15h11M35 15h11" {...common} />
          <circle cx="24" cy="15" r="9" {...common} />
          <text x="24" y="19.5" textAnchor="middle" fontSize="10" fill={stroke} fontWeight="700">
            A
          </text>
        </>
      )}
      {kind === 'voltmeter' && (
        <>
          <path d="M2 15h11M35 15h11" {...common} />
          <circle cx="24" cy="15" r="9" {...common} />
          <text x="24" y="19.5" textAnchor="middle" fontSize="10" fill={stroke} fontWeight="700">
            V
          </text>
        </>
      )}
      {kind === 'ldr' && (
        <>
          <path d="M2 15h9M37 15h9" {...common} />
          <rect x="11" y="8" width="26" height="14" rx="2" {...common} />
          <path d="M5 25l8-5M13 25l8-5" {...common} strokeWidth={1.3} />
        </>
      )}
      {kind === 'thermistor' && (
        <>
          <path d="M2 15h9M37 15h9" {...common} />
          <rect x="11" y="9" width="26" height="12" rx="2" {...common} />
          <path d="M15 24l14-16M29 8h4" {...common} />
        </>
      )}
      {kind === 'capacitor' && (
        <>
          <path d="M2 15h18M28 15h18" {...common} />
          <path d="M20 6v18M28 6v18" {...common} strokeWidth={2} />
        </>
      )}
      {kind === 'diode' && (
        <>
          <path d="M2 15h13M33 15h13" {...common} />
          <path d="M15 8v14M15 15l14-7v14z" {...common} />
          <path d="M33 8v14" {...common} strokeWidth={2} />
        </>
      )}
    </svg>
  );
}

export function Palette({ bare = false }: { bare?: boolean }) {
  const language = useCircuitStore((s) => s.language);
  const addComponent = useCircuitStore((s) => s.addComponent);
  const setSheet = useCircuitStore((s) => s.setSheet);
  const openExperiments = () => setSheet('experiments');

  const content = (
    <>
      {COMPONENT_CATEGORIES.map((category) => {
        const kinds = COMPONENT_KINDS.filter((kind) => COMPONENT_DEFS[kind].category === category);
        if (kinds.length === 0) return null;
        return (
          <div key={category}>
            <div className="palette-category">{t(language, `cat.${category}`)}</div>
            <div className="palette-grid">
              {kinds.map((kind) => (
                <button
                  key={kind}
                  className="palette-item"
                  onClick={() => addComponent(kind)}
                  title={COMPONENT_DEFS[kind].description}
                >
                  <Glyph kind={kind} />
                  <span>{componentName(language, kind)}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );

  if (bare) {
    return (
      <div>
        <button className="btn btn-subtle btn-sm" style={{ width: '100%', marginBottom: 10 }} onClick={openExperiments}>
          <Icon name="flask" size={14} />
          {t(language, 'experiments.library')}
        </button>
        {content}
      </div>
    );
  }

  return (
    <Panel
      title={t(language, 'panel.components')}
      icon="circuit"
      actions={
        <button className="btn btn-ghost btn-sm" onClick={openExperiments}>
          <span style={{ fontSize: 10.5 }}>{t(language, 'experiments.library')}</span>
        </button>
      }
      className="palette-panel"
    >
      {content}
    </Panel>
  );
}
