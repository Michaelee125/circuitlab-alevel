import { useEffect, useMemo, useState } from 'react';
import { getComponentDef, getDesignators } from '@circuitlab/circuit-core';
import type { ComponentInstance, ComponentKind } from '@circuitlab/circuit-core';
import { formatQuantity, formatWithUnit, componentDescription, componentName, t } from '@circuitlab/i18n';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  NumberField,
  Slider,
  Toggle,
} from '@circuitlab/ui';
import type { PhysicsLaw, QuantityChange } from '@circuitlab/reasoning-engine';
import { getExperiment } from '@circuitlab/teaching-engine';
import {
  useCircuitStore,
  useComparison,
  useExplain,
  useGuidedQuestions,
  useSolution,
  type RightTab,
} from '../store';
import { LT } from './Localized';

const LAW_LABEL: Record<PhysicsLaw, { en: string; zh: string }> = {
  'ohms-law': { en: 'V = IR', zh: 'U = IR' },
  'series-resistance': { en: 'Series resistances add', zh: '串联电阻相加' },
  'parallel-voltage': { en: 'Parallel p.d.', zh: '并联电压相等' },
  'kirchhoff-current': { en: 'Kirchhoff I', zh: '基尔霍夫电流定律' },
  'kirchhoff-voltage': { en: 'Kirchhoff V', zh: '基尔霍夫电压定律' },
  'potential-divider': { en: 'Potential divider', zh: '分压原理' },
  'ldr-property': { en: 'LDR property', zh: 'LDR 特性' },
  'thermistor-property': { en: 'Thermistor property', zh: '热敏电阻特性' },
  'internal-resistance': { en: 'Internal resistance', zh: '内阻' },
};

function quantityName(key: string): string {
  if (key === 'total:R') return 'R total';
  if (key === 'total:I') return 'I total';
  if (key === 'total:P') return 'P total';
  const prefix = key.split(':')[0];
  if (prefix === 'R') return 'R';
  if (prefix === 'I') return 'I';
  if (prefix === 'V') return 'V';
  if (prefix === 'P') return 'P';
  return key;
}

function directionArrow(direction: QuantityChange['direction']): string {
  if (direction === 'increase') return '↑';
  if (direction === 'decrease') return '↓';
  return '→';
}

function directionClass(direction: QuantityChange['direction']): string {
  if (direction === 'increase') return 'arrow-up';
  if (direction === 'decrease') return 'arrow-down';
  return 'arrow-flat';
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------

function ParamEditor({ comp }: { comp: ComponentInstance }) {
  const updateParams = useCircuitStore((s) => s.updateParams);
  const language = useCircuitStore((s) => s.language);
  const set = (params: Partial<ComponentInstance['params']>) => updateParams(comp.id, params);

  switch (comp.kind) {
    case 'cell':
    case 'battery':
      return (
        <>
          <Slider
            label={t(language, 'properties.emf')}
            value={comp.params.emf ?? 6}
            min={0}
            max={24}
            step={0.5}
            format={(v) => `${v.toFixed(1)} V`}
            onChange={(emf) => set({ emf })}
          />
          <Slider
            label={t(language, 'properties.internalResistance')}
            value={comp.params.internalResistance ?? 0}
            min={0}
            max={5}
            step={0.05}
            format={(v) => `${v.toFixed(2)} Ω`}
            onChange={(internalResistance) => set({ internalResistance })}
          />
        </>
      );
    case 'potentiometer':
      return (
        <>
          <Slider
            label={t(language, 'properties.resistance')}
            value={Math.min(comp.params.resistance ?? 100, 500)}
            min={1}
            max={500}
            step={1}
            format={(v) => formatQuantity(v, 'resistance')}
            onChange={(resistance) => set({ resistance })}
          />
          <NumberField
            label={t(language, 'properties.resistance')}
            value={comp.params.resistance ?? 100}
            min={0.1}
            max={1e6}
            step={1}
            unit="Ω"
            onChange={(resistance) => set({ resistance })}
          />
          <Slider
            label={t(language, 'properties.wiper')}
            value={(comp.params.wiper ?? 0.5) * 100}
            min={0}
            max={100}
            step={1}
            format={(v) => `${Math.round(v)}%`}
            onChange={(wiper) => set({ wiper: wiper / 100 })}
            hint={t(language, 'properties.wiperHint')}
          />
        </>
      );
    case 'resistor':
    case 'variable-resistor':
      return (
        <>
          <Slider
            label={t(language, 'properties.resistance')}
            value={Math.min(comp.params.resistance ?? 10, 500)}
            min={0.5}
            max={500}
            step={0.5}
            format={(v) => formatQuantity(v, 'resistance')}
            onChange={(resistance) => set({ resistance })}
          />
          <NumberField
            label={t(language, 'properties.resistance')}
            value={comp.params.resistance ?? 10}
            min={0.01}
            max={1e6}
            step={1}
            unit="Ω"
            onChange={(resistance) => set({ resistance })}
          />
        </>
      );
    case 'ldr': {
      const lux = comp.params.illuminance ?? 300;
      const reference = comp.params.referenceResistance ?? 100;
      const gamma = comp.params.gamma ?? 0.7;
      const resistance = reference * Math.pow(10 / Math.max(0.05, lux), gamma);
      return (
        <>
          <Slider
            label={t(language, 'properties.illuminance')}
            value={Math.min(lux, 5000)}
            min={10}
            max={5000}
            step={10}
            format={(v) => `${Math.round(v)} lx`}
            onChange={(illuminance) => set({ illuminance })}
            hint={`${t(language, 'properties.derivedResistance')}: ${formatQuantity(resistance, 'resistance')}`}
          />
        </>
      );
    }
    case 'thermistor':
      return (
        <Slider
          label={t(language, 'properties.temperature')}
          value={comp.params.temperatureC ?? 25}
          min={-10}
          max={120}
          step={1}
          format={(v) => `${v.toFixed(0)} °C`}
          onChange={(temperatureC) => set({ temperatureC })}
        />
      );
    case 'lamp':
      return (
        <>
          <Slider
            label={t(language, 'properties.coldResistance')}
            value={comp.params.coldResistance ?? 2}
            min={0.5}
            max={20}
            step={0.1}
            format={(v) => `${v.toFixed(1)} Ω`}
            onChange={(coldResistance) => set({ coldResistance })}
          />
          <Slider
            label={t(language, 'properties.thermalCoefficient')}
            value={comp.params.thermalCoefficient ?? 0.5}
            min={0}
            max={2}
            step={0.05}
            format={(v) => `${v.toFixed(2)} V⁻¹`}
            onChange={(thermalCoefficient) => set({ thermalCoefficient })}
          />
        </>
      );
    case 'capacitor':
      return (
        <Slider
          label={t(language, 'properties.capacitance')}
          value={(comp.params.capacitance ?? 470e-6) * 1e6}
          min={10}
          max={2200}
          step={10}
          format={(v) => `${Math.round(v)} µF`}
          onChange={(micro) => set({ capacitance: micro * 1e-6 })}
        />
      );
    case 'diode':
      return (
        <Slider
          label={t(language, 'properties.ideality')}
          value={comp.params.ideality ?? 1.8}
          min={1}
          max={3}
          step={0.1}
          format={(v) => v.toFixed(1)}
          onChange={(ideality) => set({ ideality })}
        />
      );
    case 'switch':
      return (
        <Toggle
          checked={comp.params.closed !== false}
          onChange={(closed) => set({ closed })}
          label={t(language, 'properties.closed')}
        />
      );
    case 'ammeter':
    case 'voltmeter':
      return (
        <div className="notice notice-info">
          <Icon name="info" size={14} />
          <span>{t(language, comp.kind === 'ammeter' ? 'properties.idealAmmeter' : 'properties.idealVoltmeter')}</span>
        </div>
      );
    default:
      return null;
  }
}

function CircuitOverview() {
  const solution = useSolution();
  const language = useCircuitStore((s) => s.language);
  const select = useCircuitStore((s) => s.select);
  const doc = useCircuitStore((s) => s.doc);
  const selectedWireId = useCircuitStore((s) => s.selectedWireId);
  const resetWireRoute = useCircuitStore((s) => s.resetWireRoute);
  const deleteSelected = useCircuitStore((s) => s.deleteSelected);
  const selectedWire = selectedWireId ? doc.wires.find((wire) => wire.id === selectedWireId) : undefined;
  const labels = useMemo(() => getDesignators(doc), [doc]);
  const statusKey =
    solution.status === 'ok'
      ? 'status.ok'
      : solution.status === 'open-circuit'
        ? 'status.open'
        : solution.status === 'short-circuit'
          ? 'status.short'
          : solution.status === 'singular'
            ? 'status.singular'
            : solution.status === 'no-source'
              ? 'status.noSource'
              : 'status.empty';

  return (
    <>
      {selectedWire && (
        <div className="wire-card">
          <div className="section-label">{t(language, 'wire.selected')}</div>
          <p className="wire-hint">
            {t(language, selectedWire.route ? 'wire.hintManual' : 'wire.hint')}
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button
              size="sm"
              icon="rotate"
              onClick={() => resetWireRoute(selectedWire.id)}
              disabled={!selectedWire.route}
            >
              {t(language, 'wire.reset')}
            </Button>
            <Button size="sm" variant="danger" icon="trash" onClick={deleteSelected}>
              {t(language, 'action.delete')}
            </Button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <Badge tone={solution.ok ? 'good' : 'danger'}>{t(language, statusKey)}</Badge>
        {solution.totalResistance !== null && Number.isFinite(solution.totalResistance) && (
          <Badge tone="accent">
            {t(language, 'measure.totalR')} {formatQuantity(solution.totalResistance, 'resistance')}
          </Badge>
        )}
      </div>
      {solution.errors.map((error) => (
        <div className="notice notice-danger" key={error.code} style={{ marginTop: 0 }}>
          <Icon name="info" size={14} />
          <span>{error.message}</span>
        </div>
      ))}
      {solution.warnings.slice(0, 3).map((warning) => (
        <div className="notice" key={warning.code}>
          <Icon name="info" size={14} />
          <span>{warning.message}</span>
        </div>
      ))}
      <div className="section-label">{t(language, 'panel.components')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {doc.components.length === 0 && (
          <EmptyState icon="circuit" title={t(language, 'canvas.emptyTitle')}>
            {t(language, 'canvas.emptyHint')}
          </EmptyState>
        )}
        {doc.components.map((comp) => {
          const reading = solution.components[comp.id];
          return (
            <button
              key={comp.id}
              className="compare-row"
              style={{ gridTemplateColumns: '1fr auto', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer' }}
              onClick={() => select(comp.id)}
            >
              <span style={{ fontWeight: 550 }}>
                {labels[comp.id]} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {componentName(language, comp.kind)}</span>
              </span>
              <span className="compare-values">
                {reading && reading.valid ? formatQuantity(reading.currentMagnitude, 'current') : '—'}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

export function Inspector() {
  const selectionId = useCircuitStore((s) => s.selectionId);
  const doc = useCircuitStore((s) => s.doc);
  const language = useCircuitStore((s) => s.language);
  const solution = useSolution();
  const labels = useMemo(() => getDesignators(doc), [doc]);
  const deleteSelected = useCircuitStore((s) => s.deleteSelected);
  const rotateSelected = useCircuitStore((s) => s.rotateSelected);
  const duplicateSelected = useCircuitStore((s) => s.duplicateSelected);
  const comp = doc.components.find((c) => c.id === selectionId);

  if (!comp) return <CircuitOverview />;
  const reading = solution.components[comp.id];
  const def = getComponentDef(comp.kind);
  const derived = reading?.resistance;
  const internalR = comp.params.internalResistance ?? 0;
  const isSource = comp.kind === 'cell' || comp.kind === 'battery';
  const showInternal = isSource && internalR > 0;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div className="explain-title">
            {labels[comp.id]} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {componentName(language, comp.kind)}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
            {componentDescription(language, comp.kind)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <IconButton icon="rotate" label={t(language, 'action.rotate')} onClick={rotateSelected} size={15} />
          <IconButton icon="layers" label={t(language, 'action.duplicate')} onClick={duplicateSelected} size={15} />
          <IconButton icon="trash" label={t(language, 'action.delete')} tone="danger" onClick={deleteSelected} size={15} />
        </div>
      </div>

      <ParamEditor comp={comp} />

      {reading && comp.kind === 'potentiometer' && reading.valid && (
        <>
          <div className="section-label">{t(language, 'properties.wiperOutput')}</div>
          <div className="meter-cards">
            <div className="meter-card">
              <div className="meter-card-label">{t(language, 'properties.wiperPd')}</div>
              <div className="meter-card-value">
                {formatQuantity(Math.abs(reading.extra?.wiperVoltage ?? 0), 'voltage')}
              </div>
            </div>
            <div className="meter-card">
              <div className="meter-card-label">{t(language, 'properties.sectionAW')}</div>
              <div className="meter-card-value">
                {formatQuantity(reading.extra?.resistanceAW ?? 0, 'resistance')}
              </div>
            </div>
            <div className="meter-card">
              <div className="meter-card-label">{t(language, 'properties.sectionWB')}</div>
              <div className="meter-card-value">
                {formatQuantity(reading.extra?.resistanceWB ?? 0, 'resistance')}
              </div>
            </div>
            <div className="meter-card">
              <div className="meter-card-label">{t(language, 'properties.wiperCurrent')}</div>
              <div className="meter-card-value">
                {formatQuantity(Math.abs(reading.extra?.wiperCurrent ?? 0), 'current')}
              </div>
            </div>
          </div>
          <div className="field-hint">
            V_WB = (R_WB / R_total) × V_AB = ({formatQuantity(reading.extra?.resistanceWB ?? 0, 'resistance')} /{' '}
            {formatQuantity(comp.params.resistance ?? 0, 'resistance')}) ×{' '}
            {formatQuantity(reading.voltageMagnitude, 'voltage')}
          </div>
        </>
      )}

      {reading && showInternal && (
        <>
          <div className="section-label">{t(language, 'properties.internalResistance')}</div>
          <div className="meter-cards">
            <div className="meter-card">
              <div className="meter-card-label">{t(language, 'properties.internalEmf')}</div>
              <div className="meter-card-value">{formatQuantity(comp.params.emf ?? 0, 'voltage')}</div>
            </div>
            <div className="meter-card">
              <div className="meter-card-label">{t(language, 'properties.terminalPd')}</div>
              <div className="meter-card-value">
                {formatQuantity(Math.abs(reading.terminalVoltage ?? 0), 'voltage')}
              </div>
            </div>
            <div className="meter-card">
              <div className="meter-card-label">{t(language, 'properties.lostVolts')}</div>
              <div className="meter-card-value">
                {formatQuantity(reading.currentMagnitude * internalR, 'voltage')}
              </div>
            </div>
            <div className="meter-card">
              <div className="meter-card-label">{t(language, 'measure.current')}</div>
              <div className="meter-card-value">{formatQuantity(reading.currentMagnitude, 'current')}</div>
            </div>
            <div className="meter-card">
              <div className="meter-card-label">{t(language, 'measure.power')}</div>
              <div className="meter-card-value">{formatQuantity(Math.abs(reading.power), 'power')}</div>
            </div>
          </div>
          <div className="field-hint">
            Terminal p.d. = EMF − I·r = {formatQuantity(comp.params.emf ?? 0, 'voltage')} −{' '}
            {formatQuantity(reading.currentMagnitude, 'current')} ×{' '}
            {formatQuantity(internalR, 'resistance')}
          </div>
        </>
      )}
      {reading && reading.valid && comp.kind !== 'ammeter' && comp.kind !== 'voltmeter' && !showInternal && (
        <>
          <div className="section-label">{t(language, 'panel.measure')}</div>
          <div className="meter-cards">
            <div className="meter-card">
              <div className="meter-card-label">{t(language, 'measure.current')}</div>
              <div className="meter-card-value">{formatQuantity(reading.currentMagnitude, 'current')}</div>
            </div>
            <div className="meter-card">
              <div className="meter-card-label">{t(language, 'measure.voltage')}</div>
              <div className="meter-card-value">{formatQuantity(reading.voltageMagnitude, 'voltage')}</div>
            </div>
            <div className="meter-card">
              <div className="meter-card-label">{t(language, 'measure.power')}</div>
              <div className="meter-card-value">{formatQuantity(Math.abs(reading.power), 'power')}</div>
            </div>
            {derived !== undefined && derived !== null && Number.isFinite(derived) && (
              <div className="meter-card">
                <div className="meter-card-label">{t(language, 'properties.derivedResistance')}</div>
                <div className="meter-card-value">{formatQuantity(derived, 'resistance')}</div>
              </div>
            )}
          </div>
        </>
      )}
      {comp.kind === 'ammeter' && reading && (
        <div className="meter-cards">
          <div className="meter-card">
            <div className="meter-card-label">{t(language, 'measure.current')}</div>
            <div className="meter-card-value">{formatQuantity(reading.currentMagnitude, 'current')}</div>
          </div>
        </div>
      )}
      {comp.kind === 'voltmeter' && reading && (
        <div className="meter-cards">
          <div className="meter-card">
            <div className="meter-card-label">{t(language, 'measure.voltage')}</div>
            <div className="meter-card-value">{formatQuantity(reading.voltageMagnitude, 'voltage')}</div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Explain
// ---------------------------------------------------------------------------

export function ExplainPanel() {
  const explain = useExplain();
  const language = useCircuitStore((s) => s.language);
  const setHighlight = useCircuitStore((s) => s.setHighlight);
  const refDoc = useCircuitStore((s) => s.refDoc);
  const experimentId = useCircuitStore((s) => s.experimentId);
  const experiment = experimentId ? getExperiment(experimentId) : null;
  const applyAction = useCircuitStore((s) => s.applyExperimentAction);
  const [highlightStep, setHighlightStep] = useState<string | null>(null);

  useEffect(() => {
    if (explain) setHighlight(explain.highlights);
    return () => setHighlight([]);
  }, [explain?.ruleId, explain?.changes, setHighlight, explain]);

  if (!refDoc || !explain) {
    if (experiment) {
      return (
        <div>
          <div className="explain-title">
            <LT value={experiment.title} />
          </div>
          <p className="explain-summary">
            <LT value={experiment.subtitle} block />
          </p>
          <div className="section-label" style={{ marginTop: 0 }}>
            {t(language, 'experiments.instructions')}
          </div>
          <ol style={{ margin: '0 0 14px', paddingLeft: 16, fontSize: 11.5, lineHeight: 1.7, color: 'var(--ink-2)' }}>
            {(language === 'zh' ? experiment.instructions.zh : experiment.instructions.en).map((line) => (
              <li key={line} style={{ marginBottom: 5 }}>{line}</li>
            ))}
          </ol>
          {experiment.actions.length > 0 && (
            <>
              <div className="section-label">{t(language, 'experiments.actions')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
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
          <div className="notice notice-info">
            <Icon name="info" size={14} />
            <span>{t(language, 'explain.hint')}</span>
          </div>
        </div>
      );
    }
    return (
      <EmptyState icon="zap" title={t(language, 'explain.noChange')}>
        {t(language, 'explain.hint')}
      </EmptyState>
    );
  }

  if (!explain.supported) {
    return (
      <div>
        <div className="explain-title">{t(language, 'explain.notSupported')}</div>
        <div className="notice notice-info">
          <Icon name="help" size={14} />
          <span>
            <LT value={explain.reason ?? { en: '', zh: '' }} block />
          </span>
        </div>
        <div className="notice">
          <Icon name="info" size={14} />
          <span>{t(language, 'explain.practiceNotice')}</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <Badge tone="accent">{explain.ruleId}</Badge>
        <Badge tone="neutral">{t(language, 'explain.chain')}</Badge>
      </div>
      <h3 className="explain-title">
        <LT value={explain.title} />
      </h3>
      <p className="explain-summary">
        <LT value={explain.summary} block />
      </p>

      <div className="section-label" style={{ marginTop: 0 }}>
        {t(language, 'explain.cause')}
      </div>
      <div className="chain">
        {explain.steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            data-kind={step.kind}
            className={`chain-step ${highlightStep === step.id ? 'is-highlighted' : ''}`}
            style={{ textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }}
            onClick={() => {
              setHighlightStep(step.id);
              setHighlight(step.highlight ?? explain.highlights);
            }}
          >
            <span className="chain-marker">{String(index + 1).padStart(2, '0')}</span>
            <span className="chain-content">
              <span className="chain-text">
                <LT value={{ en: step.en, zh: step.zh }} block />
              </span>
              <span className="chain-meta">
                <span className="law-chip">
                  <LT value={LAW_LABEL[step.law]} />
                </span>
                {step.quantities &&
                  Object.entries(step.quantities).map(([key, quantity]) => (
                    <span className="quantity-pill" key={key}>
                      {quantityName(key)} {formatWithUnit(quantity.before, quantity.unit)} →{' '}
                      {formatWithUnit(quantity.after, quantity.unit)}{' '}
                      <span className={directionClass(quantity.direction)}>
                        {directionArrow(quantity.direction)}
                      </span>
                    </span>
                  ))}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="section-label">{t(language, 'explain.marking')}</div>
      <ul className="marking-list">
        {explain.markingPoints.map((point, index) => (
          <li key={index}>
            <span className="marking-check">
              <Icon name="check" size={10} />
            </span>
            <span>
              <LT value={point} block />
            </span>
          </li>
        ))}
      </ul>

      <div className="section-label">{t(language, 'explain.answer')}</div>
      <details>
        <summary
          style={{
            cursor: 'pointer',
            fontSize: 11.5,
            color: 'var(--accent)',
            padding: '6px 0',
            userSelect: 'none',
          }}
        >
          {language === 'zh' ? '展开参考答案' : language === 'bilingual' ? 'Show model answer / 展开参考答案' : 'Show model answer'}
        </summary>
        <div className="answer-box" style={{ marginTop: 8 }}>
          <LT value={explain.answer} block />
        </div>
      </details>

      <div className="notice">
        <Icon name="info" size={14} />
        <span>{t(language, 'explain.practiceNotice')}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

export function ComparePanel() {
  const rows = useComparison();
  const language = useCircuitStore((s) => s.language);
  if (!rows || rows.length === 0) {
    return (
      <EmptyState icon="layers" title={t(language, 'compare.empty')}>
        {t(language, 'explain.compareHint')}
      </EmptyState>
    );
  }
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = grouped.get(row.componentId) ?? [];
    list.push(row);
    grouped.set(row.componentId, list);
  }
  return (
    <div className="compare-grid">
      {[...grouped.entries()].map(([id, list]) => (
        <div className="compare-card" key={id}>
          <div className="compare-card-head">
            <span>{list[0].label}</span>
            <Badge>{list[0].kind}</Badge>
          </div>
          {list.map((row) => (
            <div className="compare-row" key={`${id}-${row.quantity}`}>
              <span className="compare-qty">{row.quantity}</span>
              <span className="compare-values">
                {formatWithUnit(row.before, row.unit)}
                <span style={{ color: 'var(--muted)' }}>→</span>
                {formatWithUnit(row.after, row.unit)}
              </span>
              <span className={directionClass(row.direction)} title={row.direction}>
                {directionArrow(row.direction)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guided
// ---------------------------------------------------------------------------

export function GuidedPanel() {
  const language = useCircuitStore((s) => s.language);
  const questions = useGuidedQuestions();
  const explain = useExplain();
  const quizKey = useCircuitStore((s) => s.quizKey);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    setAnswers({});
  }, [quizKey, questions.length]);

  const score = Object.entries(answers).filter(([id, option]) => {
    const question = questions.find((q) => q.id === id);
    return question && question.correctOptionId === option;
  }).length;

  if (!explain || questions.length === 0) {
    return (
      <EmptyState icon="help" title={t(language, 'guided.intro')}>
        {t(language, 'guided.needsChange')}
      </EmptyState>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Badge tone="accent">{t(language, 'guided.score')} {score}/{questions.length}</Badge>
        <Button
          size="sm"
          variant="ghost"
          icon="undo"
          onClick={() => setAnswers({})}
        >
          {t(language, 'action.restart')}
        </Button>
      </div>
      {questions.map((question, index) => {
        const chosen = answers[question.id];
        const answered = Boolean(chosen);
        const correct = chosen === question.correctOptionId;
        return (
          <div className="compare-card" key={question.id} style={{ marginBottom: 10 }}>
            <div className="compare-card-head" style={{ alignItems: 'flex-start' }}>
              <span style={{ display: 'flex', gap: 8 }}>
                <span className="chain-marker">{String(index + 1).padStart(2, '0')}</span>
                <LT value={question.prompt} block />
              </span>
            </div>
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {question.options.map((option) => {
                const isChosen = chosen === option.id;
                const isCorrect = answered && option.id === question.correctOptionId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className="btn btn-subtle"
                    style={{
                      justifyContent: 'flex-start',
                      borderColor: isCorrect
                        ? 'color-mix(in srgb, var(--good) 55%, transparent)'
                        : isChosen && !correct
                          ? 'color-mix(in srgb, var(--danger) 50%, transparent)'
                          : undefined,
                      background: isCorrect
                        ? 'color-mix(in srgb, var(--good) 10%, transparent)'
                        : isChosen && !correct
                          ? 'color-mix(in srgb, var(--danger) 8%, transparent)'
                          : undefined,
                      whiteSpace: 'normal',
                      textAlign: 'left',
                    }}
                    disabled={answered}
                    onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: option.id }))}
                  >
                    <LT value={option.label} />
                  </button>
                );
              })}
              {answered && (
                <div
                  className={correct ? 'notice notice-info' : 'notice notice-danger'}
                  style={{ marginTop: 2 }}
                >
                  <Icon name={correct ? 'check' : 'x'} size={14} />
                  <span>
                    <strong style={{ display: 'block', marginBottom: 2 }}>
                      {correct ? t(language, 'guided.correct') : t(language, 'guided.incorrect')}
                    </strong>
                    <LT value={question.explanation} block />
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rail
// ---------------------------------------------------------------------------

export function RightRail() {
  const language = useCircuitStore((s) => s.language);
  const mode = useCircuitStore((s) => s.mode);
  const rightTab = useCircuitStore((s) => s.rightTab);
  const setRightTab = useCircuitStore((s) => s.setRightTab);
  const pinnedPreference = useCircuitStore((s) => s.explainPinned);
  const toggleExplainPinned = useCircuitStore((s) => s.toggleExplainPinned);

  const pinned = pinnedPreference;

  const allTabs: { id: RightTab; label: string; icon: 'sliders' | 'zap' | 'layers' | 'help' }[] =
    mode === 'guided'
      ? [
          { id: 'guided', label: t(language, 'mode.guided'), icon: 'help' },
          { id: 'explain', label: t(language, 'panel.explain'), icon: 'zap' },
          { id: 'inspector', label: t(language, 'panel.properties'), icon: 'sliders' },
        ]
      : [
          { id: 'inspector', label: t(language, 'panel.properties'), icon: 'sliders' },
          { id: 'explain', label: t(language, 'panel.explain'), icon: 'zap' },
          { id: 'compare', label: t(language, 'panel.compare'), icon: 'layers' },
        ];

  const tabs = pinned ? allTabs.filter((tab) => tab.id !== 'explain') : allTabs;
  const active = tabs.some((tab) => tab.id === rightTab) ? rightTab : tabs[0].id;

  const tabContent = (
    <>
      {active === 'inspector' && <Inspector />}
      {active === 'explain' && <ExplainPanel />}
      {active === 'compare' && <ComparePanel />}
      {active === 'guided' && <GuidedPanel />}
    </>
  );

  return (
    <>
      <div className="rail-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            className={`rail-tab ${active === tab.id ? 'is-active' : ''}`}
            onClick={() => setRightTab(tab.id)}
          >
            <Icon name={tab.icon} size={14} />
            {tab.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <IconButton
          icon="pin"
          size={14}
          tone="ghost"
          active={pinned}
          aria-pressed={pinned}
          label={t(language, pinned ? 'explain.unpin' : 'explain.pin')}
          onClick={toggleExplainPinned}
          className="pin-toggle"
        />
      </div>

      {pinned ? (
        <div className="rail-split">
          <div className="rail-pane">
            <div className="rail-body">{tabContent}</div>
          </div>
          <section className="rail-pane rail-pane-explain">
            <div className="rail-pane-head">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="zap" size={13} />
                {t(language, 'explain.pinned')}
              </span>
              <IconButton
                icon="pin"
                size={13}
                tone="ghost"
                active
                label={t(language, 'explain.unpin')}
                onClick={toggleExplainPinned}
              />
            </div>
            <div className="rail-body">
              <ExplainPanel />
            </div>
          </section>
        </div>
      ) : (
        <div className="rail-body">{tabContent}</div>
      )}

      <div style={{ padding: '9px 12px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 0.3 }}>
          CircuitLab Physics · Phase 1
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => useCircuitStore.getState().setSheet('help')} style={{ fontSize: 10 }}>
          <Icon name="help" size={12} /> {t(language, 'help.title')}
        </button>
      </div>
    </>
  );
}
