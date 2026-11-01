import { useEffect, useMemo, useRef, useState } from 'react';
import { getDesignators } from '@circuitlab/circuit-core';
import { formatQuantity, t } from '@circuitlab/i18n';
import { Badge, Button, EmptyState, Icon, IconButton, Segmented, Spinner } from '@circuitlab/ui';
import { linearFit, solveRCTransient } from '@circuitlab/physics-engine';
import { experimentSweep, getExperiment } from '@circuitlab/teaching-engine';
import { useCircuitStore, useSolution } from '../store';

type ECharts = typeof import('echarts');
type Series = { name: string; points: [number, number][]; color?: string; dashed?: boolean; area?: boolean };

function chartColors(theme: string) {
  return theme === 'light'
    ? { axis: '#6b7280', split: 'rgba(0,122,255,0.10)', text: '#1c1c1e', accent: '#007aff', accent2: '#5856d6', warn: '#c93400' }
    : { axis: '#8e8e93', split: 'rgba(108,196,255,0.10)', text: '#e6e6ea', accent: '#6cc4ff', accent2: '#5e5ce6', warn: '#ff9f0a' };
}

export function ChartView() {
  const doc = useCircuitStore((s) => s.doc);
  const experimentId = useCircuitStore((s) => s.experimentId);
  const theme = useCircuitStore((s) => s.theme);
  const language = useCircuitStore((s) => s.language);
  const recorded = useCircuitStore((s) => s.recorded);
  const transientInitialVoltage = useCircuitStore((s) => s.transientInitialVoltage);
  const setTransientInitialVoltage = useCircuitStore((s) => s.setTransientInitialVoltage);
  const [lib, setLib] = useState<ECharts | null>(null);
  const [transientSeries, setTransientSeries] = useState<'voltage' | 'current'>('voltage');
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<ECharts['init']> | null>(null);
  const experiment = experimentId ? getExperiment(experimentId) : null;
  const colors = chartColors(theme);

  useEffect(() => {
    let active = true;
    if (!lib) {
      void import('echarts').then((module) => {
        if (active) setLib(module);
      });
    }
    return () => {
      active = false;
    };
  }, [lib]);

  const chartData = useMemo(() => {
    if (!experiment) {
      if (recorded.length >= 2) {
        return {
          series: [
            {
              name: 'Recorded',
              points: recorded.map((p) => [p.x, p.y] as [number, number]),
              color: colors.accent,
            },
          ],
          xLabel: { en: 'Current I (A)', zh: '电流 I (A)' },
          yLabel: { en: 'Terminal p.d. V (V)', zh: '端电压 U (V)' },
          fit: linearFit(recorded.map((p) => ({ x: p.x, y: p.y }))),
          transient: false,
          note: t(language, 'chart.data'),
        };
      }
      return null;
    }

    if (experiment.chart === 'iv') {
      const sweep = experimentSweep(experiment, doc);
      if (!sweep || !sweep.ok || sweep.points.length === 0) return null;
      return {
        series: [
          {
            name: experiment.title.en,
            points: sweep.points.map((p) => [p.voltage, p.current] as [number, number]),
            color: colors.accent,
            area: true,
          },
        ],
        xLabel: experiment.axisLabels?.x ?? { en: 'Voltage (V)', zh: '电压 (V)' },
        yLabel: experiment.axisLabels?.y ?? { en: 'Current (A)', zh: '电流 (A)' },
        fit: null,
        transient: false,
        note: t(language, 'chart.sweep'),
      };
    }

    if (experiment.chart === 'vi' && experiment.dataset) {
      const points = experiment.dataset(doc);
      if (points.length === 0) return null;
      const fit = linearFit(points);
      return {
        series: [
          {
            name: 'V–I',
            points: points.map((p) => [p.x, p.y] as [number, number]),
            color: colors.accent,
          },
          {
            name: t(language, 'chart.fit'),
            points: [
              [0, fit.intercept],
              [Math.max(...points.map((p) => p.x)), fit.intercept + fit.slope * Math.max(...points.map((p) => p.x))],
            ] as [number, number][],
            color: colors.warn,
            dashed: true,
          },
        ],
        xLabel: experiment.axisLabels?.x ?? { en: 'Current I (A)', zh: '电流 I (A)' },
        yLabel: experiment.axisLabels?.y ?? { en: 'Terminal p.d. V (V)', zh: '端电压 U (V)' },
        fit,
        transient: false,
        note: t(language, 'chart.data'),
      };
    }

    if (experiment.chart === 'vt' || experiment.chart === 'it') {
      const transient = solveRCTransient(doc, {
        initialVoltage: transientInitialVoltage,
        duration: experiment.transient?.duration ?? 30,
        steps: 160,
      });
      if (!transient.ok) return null;
      const points = transient.points.map((p) =>
        [p.t, transientSeries === 'voltage' ? p.voltage : p.current] as [number, number],
      );
      return {
        series: [{ name: transientSeries, points, color: colors.accent, area: true }],
        xLabel: experiment.axisLabels?.x ?? { en: 'Time t (s)', zh: '时间 t (s)' },
        yLabel:
          transientSeries === 'voltage'
            ? (experiment.axisLabels?.y ?? { en: 'Capacitor p.d. Vc (V)', zh: '电容电压 Uc (V)' })
            : { en: 'Current I (A)', zh: '电流 I (A)' },
        fit: null,
        transient: true,
        timeConstant: transient.timeConstant,
        transientMode: transient.mode,
        note: `${t(language, 'chart.timeConstant')} = ${transient.timeConstant.toFixed(2)} s`,
      };
    }

    return null;
  }, [experiment, doc, recorded, colors.accent, colors.warn, transientSeries, transientInitialVoltage, language]);

  const option = useMemo(() => {
    if (!chartData) return null;
    const label = (value: { en: string; zh: string }) =>
      language === 'zh' ? value.zh : language === 'bilingual' ? `${value.en} / ${value.zh}` : value.en;
    return {
      backgroundColor: 'transparent',
      animationDuration: 300,
      grid: { left: 58, right: 22, top: 26, bottom: 46 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: theme === 'light' ? '#ffffff' : '#0b1a2a',
        borderColor: theme === 'light' ? 'rgba(2,132,199,0.2)' : 'rgba(86,200,255,0.2)',
        textStyle: { color: colors.text, fontSize: 11 },
        axisPointer: { type: 'cross', lineStyle: { color: colors.axis, opacity: 0.4 } },
      },
      legend: {
        show: chartData.series.length > 1,
        top: 0,
        right: 8,
        textStyle: { color: colors.axis, fontSize: 10 },
        itemWidth: 14,
        itemHeight: 3,
      },
      xAxis: {
        type: 'value',
        name: label(chartData.xLabel),
        nameLocation: 'middle',
        nameGap: 28,
        nameTextStyle: { color: colors.axis, fontSize: 10.5 },
        axisLine: { lineStyle: { color: colors.split } },
        axisLabel: { color: colors.axis, fontSize: 10 },
        splitLine: { lineStyle: { color: colors.split, type: 'dashed' } },
        scale: true,
      },
      yAxis: {
        type: 'value',
        name: label(chartData.yLabel),
        nameLocation: 'middle',
        nameGap: 44,
        nameTextStyle: { color: colors.axis, fontSize: 10.5 },
        axisLine: { show: false },
        axisLabel: { color: colors.axis, fontSize: 10 },
        splitLine: { lineStyle: { color: colors.split, type: 'dashed' } },
        scale: true,
      },
      series: chartData.series.map((series: Series, index: number) => ({
        name: series.name,
        type: 'line',
        showSymbol: false,
        smooth: false,
        data: series.points,
        lineStyle: {
          width: index === 0 ? 2.2 : 1.4,
          color: series.color ?? colors.accent,
          type: series.dashed ? 'dashed' : 'solid',
        },
        itemStyle: { color: series.color ?? colors.accent },
        areaStyle: series.area
          ? {
              opacity: 0.14,
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: series.color ?? colors.accent },
                  { offset: 1, color: 'rgba(0,0,0,0)' },
                ],
              },
            }
          : undefined,
      })),
    };
  }, [chartData, theme, colors, language, chartData?.series.length]);

  useEffect(() => {
    if (!lib || !option || !containerRef.current) return;
    const chart = chartRef.current ?? lib.init(containerRef.current);
    chartRef.current = chart;
    chart.setOption(option as never, true);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [lib, option]);

  useEffect(
    () => () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    },
    [],
  );

  const exportCsv = async () => {
    if (!chartData) return;
    const header = `${chartData.xLabel.en},${chartData.yLabel.en}`;
    const rows = chartData.series[0].points.map((p) => `${p[0]},${p[1]}`);
    const csv = [header, ...rows].join('\n');
    const ok = await (await import('@circuitlab/platform-adapters')).getAdapters().exporter.saveFile(
      'circuitlab-data.csv',
      csv,
      'text/csv',
    );
    useCircuitStore.getState().toastMessage(ok ? 'CSV exported' : 'Export is not available on this platform', ok ? 'ok' : 'error');
  };

  if (!chartData) {
    return (
      <EmptyState icon="chart" title={t(language, 'chart.empty')}>
        {experiment ? experiment.subtitle.en : t(language, 'explain.hint')}
      </EmptyState>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 6px 6px', flexWrap: 'wrap' }}>
        <Badge tone="accent">{t(language, 'chart.characteristic')}</Badge>
        {chartData.transient && (
          <Segmented
            value={transientSeries}
            ariaLabel="Transient series"
            onChange={setTransientSeries}
            options={[
              { id: 'voltage', label: language === 'zh' ? '电压 Uc' : 'Vc' },
              { id: 'current', label: language === 'zh' ? '电流 I' : 'I' },
            ]}
          />
        )}
        {chartData.fit && (
          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>
            {t(language, 'chart.gradient')} {chartData.fit.slope.toFixed(3)} · {t(language, 'chart.intercept')}{' '}
            {chartData.fit.intercept.toFixed(3)}
          </span>
        )}
        {chartData.timeConstant !== undefined && (
          <Badge tone="neutral">τ = {chartData.timeConstant.toFixed(2)} s</Badge>
        )}
        <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{chartData.note}</span>
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" icon="download" onClick={exportCsv}>
          {t(language, 'chart.export')}
        </Button>
      </div>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, width: '100%' }} />
      {experiment?.chart === 'vt' && (
        <div style={{ padding: '4px 8px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>
            {t(language, 'chart.timeConstant')} · initial Vc
          </span>
          <input
            className="input"
            style={{ width: 90, minHeight: 26, padding: '3px 7px', fontSize: 11 }}
            type="number"
            step={0.5}
            value={transientInitialVoltage}
            onChange={(event) => setTransientInitialVoltage(Math.max(0, Number(event.target.value) || 0))}
          />
          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>V</span>
        </div>
      )}
    </div>
  );
}

export function Measurements() {
  const doc = useCircuitStore((s) => s.doc);
  const solution = useSolution();
  const language = useCircuitStore((s) => s.language);
  const selectionId = useCircuitStore((s) => s.selectionId);
  const select = useCircuitStore((s) => s.select);
  const labels = useMemo(() => getDesignators(doc), [doc]);

  const meters = doc.components.filter((c) => c.kind === 'ammeter' || c.kind === 'voltmeter');
  const source = doc.components.find((c) => c.kind === 'cell' || c.kind === 'battery');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto', padding: '2px 4px' }}>
      <div className="meter-cards">
        {source && solution.components[source.id] && (
          <>
            <div className="meter-card">
              <div className="meter-card-label">{t(language, 'measure.totalI')}</div>
              <div className="meter-card-value">
                {formatQuantity(solution.components[source.id].currentMagnitude, 'current')}
              </div>
            </div>
            <div className="meter-card">
              <div className="meter-card-label">EMF</div>
              <div className="meter-card-value">{formatQuantity(source.params.emf ?? 0, 'voltage')}</div>
            </div>
            <div className="meter-card">
              <div className="meter-card-label">{t(language, 'measure.totalR')}</div>
              <div className="meter-card-value">
                {solution.totalResistance !== null && Number.isFinite(solution.totalResistance)
                  ? formatQuantity(solution.totalResistance, 'resistance')
                  : '∞'}
              </div>
            </div>
            <div className="meter-card">
              <div className="meter-card-label">{t(language, 'measure.totalP')}</div>
              <div className="meter-card-value">
                {formatQuantity(Math.abs(solution.totalPowerDelivered), 'power')}
              </div>
            </div>
          </>
        )}
        {meters.map((meter) => {
          const reading = solution.components[meter.id];
          return (
            <div className="meter-card" key={meter.id}>
              <div className="meter-card-label">
                <span>
                  {labels[meter.id]} · {meter.kind === 'ammeter' ? 'A' : 'V'}
                </span>
                <Icon name="target" size={11} />
              </div>
              <div className="meter-card-value">
                {reading
                  ? meter.kind === 'ammeter'
                    ? formatQuantity(reading.currentMagnitude, 'current')
                    : formatQuantity(reading.voltageMagnitude, 'voltage')
                  : '—'}
              </div>
            </div>
          );
        })}
      </div>

      {doc.components.length === 0 ? (
        <EmptyState icon="chart" title={t(language, 'measure.none')} />
      ) : (
        <table className="measure-table">
          <thead>
            <tr>
              <th>{t(language, 'measure.component')}</th>
              <th>I</th>
              <th>V</th>
              <th>R</th>
              <th>P</th>
            </tr>
          </thead>
          <tbody>
            {doc.components.map((comp) => {
              const reading = solution.components[comp.id];
              return (
                <tr
                  key={comp.id}
                  className={comp.id === selectionId ? 'is-selected' : ''}
                  onClick={() => select(comp.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>{labels[comp.id]}</td>
                  <td>
                    {reading?.valid ? formatQuantity(reading.currentMagnitude, 'current') : '—'}
                  </td>
                  <td>
                    {reading?.valid ? formatQuantity(reading.voltageMagnitude, 'voltage') : '—'}
                  </td>
                  <td>
                    {reading?.resistance !== null && reading?.resistance !== undefined
                      ? formatQuantity(reading.resistance, 'resistance')
                      : '—'}
                  </td>
                  <td>{reading?.valid ? formatQuantity(Math.abs(reading.power), 'power') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function ExperimentActions({ compact = false }: { compact?: boolean }) {
  const experimentId = useCircuitStore((s) => s.experimentId);
  const experiment = experimentId ? getExperiment(experimentId) : null;
  const applyAction = useCircuitStore((s) => s.applyExperimentAction);
  const language = useCircuitStore((s) => s.language);
  if (!experiment || experiment.actions.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: compact ? 0 : 2 }}>
      {experiment.actions.map((action) => (
        <Button
          key={action.id}
          size="sm"
          variant="subtle"
          icon="zap"
          onClick={() => applyAction(action.id)}
          style={{ flexShrink: 0 }}
        >
          {language === 'zh' ? action.label.zh : action.label.en}
        </Button>
      ))}
    </div>
  );
}

export function BottomDock() {
  const language = useCircuitStore((s) => s.language);
  const open = useCircuitStore((s) => s.bottomOpen);
  const tab = useCircuitStore((s) => s.bottomTab);
  const setTab = useCircuitStore((s) => s.setBottomTab);
  const experimentId = useCircuitStore((s) => s.experimentId);
  const experiment = experimentId ? getExperiment(experimentId) : null;

  if (!open) return null;
  return (
    <div className="bottom-dock">
      <div className="bottom-dock-head">
        <Segmented
          value={tab}
          ariaLabel="Bottom panel"
          onChange={setTab}
          options={[
            { id: 'chart', label: t(language, 'panel.graph') },
            { id: 'measure', label: t(language, 'panel.measure') },
          ]}
        />
        <div style={{ flex: 1 }} />
        <ExperimentActions />
        <IconButton
          icon="x"
          label={t(language, 'action.close')}
          size={15}
          onClick={() => useCircuitStore.getState().setBottomOpen(false)}
        />
      </div>
      <div className="bottom-dock-body">
        {tab === 'chart' ? <ChartView /> : <Measurements />}
      </div>
      {experiment && (
        <div style={{ padding: '0 12px 8px', fontSize: 10.5, color: 'var(--muted)' }}>
          <Icon name="info" size={11} />{' '}
          {language === 'zh' ? experiment.instructions.zh[0] : experiment.instructions.en[0]}
        </div>
      )}
    </div>
  );
}

export function ChartLoading() {
  return <Spinner label={t(useCircuitStore.getState().language, 'panel.graph')} />;
}
