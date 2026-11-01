import { getComponentDef } from '@circuitlab/circuit-core';
import type { ComponentInstance, ComponentParams } from '@circuitlab/circuit-core';

/** Ideal meter models. Documented in docs/physics-validation.md. */
export const IDEAL_AMMETER_RESISTANCE = 1e-6;
export const IDEAL_VOLTMETER_RESISTANCE = 1e9;

/** Thermal voltage at 300 K. */
export const VT = 0.025852;

/** LDR reference illuminance, in lux. */
export const LDR_REFERENCE_LUX = 10;

export function ldrResistance(params: ComponentParams): number {
  const reference = params.referenceResistance ?? 100;
  const gamma = params.gamma ?? 0.7;
  const lux = Math.max(0.05, params.illuminance ?? 300);
  return reference * Math.pow(LDR_REFERENCE_LUX / lux, gamma);
}

/** Inverse of the LDR model: illuminance that produces a given resistance. */
export function ldrIlluminanceForResistance(resistance: number, params: ComponentParams = {}): number {
  const reference = params.referenceResistance ?? 100;
  const gamma = params.gamma ?? 0.7;
  const ratio = Math.max(1e-6, resistance / reference);
  return LDR_REFERENCE_LUX * Math.pow(ratio, -1 / gamma);
}

export function thermistorResistance(params: ComponentParams): number {
  const reference = params.referenceResistance ?? 1000;
  const beta = params.beta ?? 3500;
  const celsius = params.temperatureC ?? 25;
  const kelvin = Math.max(1, celsius + 273.15);
  const referenceKelvin = 298.15;
  return reference * Math.exp(beta * (1 / kelvin - 1 / referenceKelvin));
}

/**
 * Filament lamp model. The resistance of a tungsten filament rises with
 * temperature, and the temperature rises with the power dissipated:
 *
 *   R(V) = R_cold · (1 + k·|V|),   I(V) = V / R(V)
 *
 * This is a smooth, odd, strictly increasing and always dissipative model that
 * reproduces the classic non-ohmic lamp characteristic without the numerical
 * instability of a self-referential power model.
 */
export function lampResistance(coldResistance: number, coefficient: number, voltage: number): number {
  const r0 = Math.max(0.01, coldResistance);
  return r0 * (1 + Math.max(0, coefficient) * Math.abs(voltage));
}

export function lampCurrent(
  coldResistance: number,
  coefficient: number,
  voltage: number,
): number {
  const k = Math.max(0, coefficient);
  const r0 = Math.max(0.01, coldResistance);
  return voltage / (r0 * (1 + k * Math.abs(voltage)));
}

/** dI/dV of the lamp model. */
export function lampConductance(
  coldResistance: number,
  coefficient: number,
  voltage: number,
): number {
  const k = Math.max(0, coefficient);
  const r0 = Math.max(0.01, coldResistance);
  const denom = r0 * (1 + k * Math.abs(voltage));
  return 1 / (denom * denom) * r0;
}

function diodeArgument(voltage: number, ideality: number): number {
  const nVt = Math.max(1e-4, ideality * VT);
  const raw = voltage / nVt;
  // Clamp the exponential so Newton iterations cannot overflow.
  return Math.min(38, Math.max(-38, raw));
}

export function diodeCurrent(
  voltage: number,
  saturationCurrent: number,
  ideality: number,
): number {
  const is = Math.max(1e-18, saturationCurrent);
  const nVt = Math.max(1e-4, ideality * VT);
  return is * (Math.exp(diodeArgument(voltage, ideality)) - 1);
}

export function diodeConductance(
  voltage: number,
  saturationCurrent: number,
  ideality: number,
): number {
  const is = Math.max(1e-18, saturationCurrent);
  const nVt = Math.max(1e-4, ideality * VT);
  return (is / nVt) * Math.exp(diodeArgument(voltage, ideality));
}

/**
 * Linear resistance of the purely resistive components (Ω).
 * Returns null for components that need a companion model or are not resistive.
 */
export function linearResistance(comp: ComponentInstance): number | null {
  switch (comp.kind) {
    case 'resistor':
    case 'variable-resistor':
      return Math.max(0.01, comp.params.resistance ?? 10);
    case 'ldr':
      return Math.max(0.01, ldrResistance(comp.params));
    case 'thermistor':
      return Math.max(0.01, thermistorResistance(comp.params));
    case 'ammeter':
      return IDEAL_AMMETER_RESISTANCE;
    case 'voltmeter':
      return IDEAL_VOLTMETER_RESISTANCE;
    case 'switch':
      return comp.params.closed === false ? null : 1e-6;
    default:
      return null;
  }
}

/** True when the component can carry steady direct current. */
export function conductsDC(comp: ComponentInstance): boolean {
  switch (comp.kind) {
    case 'capacitor':
      return false;
    case 'voltmeter':
      return false;
    case 'switch':
      return comp.params.closed !== false;
    default:
      return true;
  }
}

export function componentLabel(comp: ComponentInstance): string {
  if (comp.label) return comp.label;
  return getComponentDef(comp.kind).name;
}
