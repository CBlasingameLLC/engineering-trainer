import type { Generator } from './types.js';
import { ohmsLaw, powerSignConvention } from './ee2300/fundamentals.js';
import { currentDivider, deltaWye, seriesParallel, voltageDivider } from './ee2300/networks.js';
import {
  dependentSource, meshTwoLoop, nodalTwoSource, supermesh, supernode,
} from './ee2300/analysis.js';
import {
  maxPowerTransfer, nortonCurrent, sourceTransformation, theveninResistance, theveninVoltage,
} from './ee2300/theorems.js';
import { opAmpCascade, opAmpGain, opAmpSumming } from './ee2300/opamps.js';
import {
  inductorBehaviour, naturalResponseTau, rcStepResponse, rlcDamping,
} from './ee2300/transients.js';

export * from './rng.js';
export * from './types.js';
export * from './build.js';

/** Every registered generator, keyed by id. */
export const GENERATORS: readonly Generator[] = [
  ohmsLaw,
  powerSignConvention,
  seriesParallel,
  voltageDivider,
  currentDivider,
  deltaWye,
  nodalTwoSource,
  supernode,
  meshTwoLoop,
  supermesh,
  dependentSource,
  sourceTransformation,
  theveninVoltage,
  theveninResistance,
  nortonCurrent,
  maxPowerTransfer,
  opAmpGain,
  opAmpSumming,
  opAmpCascade,
  naturalResponseTau,
  inductorBehaviour,
  rcStepResponse,
  rlcDamping,
];

export const generatorById = (id: string): Generator | undefined =>
  GENERATORS.find((g) => g.id === id);

export const generatorsForCourse = (course: string): Generator[] =>
  GENERATORS.filter((g) => g.kcRefs.some((r) => r.kc.startsWith(`${course.toLowerCase()}.`)));
