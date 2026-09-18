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
import { dividerDesign, opAmpGainDesign, rcTimeConstantDesign } from './ee2300/design.js';
import { CALCULUS_GENERATORS } from './math/calculus.js';
import { ODE_GENERATORS } from './math/odes.js';
import { LINEAR_ALGEBRA_GENERATORS } from './math/linear.js';
import { MATH2358_LOGIC_GENERATORS } from './math2358/logic.js';
import { MATH2358_SET_GENERATORS } from './math2358/sets.js';
import { MATH2358_COUNTING_GENERATORS } from './math2358/counting.js';
import { MATH2358_GRAPH_GENERATORS } from './math2358/graphs.js';
import { EE2320_NUMBER_GENERATORS } from './ee2320/numbers.js';
import { EE2320_LOGIC_GENERATORS } from './ee2320/logic.js';
import { EE2320_BLOCK_GENERATORS } from './ee2320/blocks.js';
import { EE2320_SEQUENTIAL_GENERATORS } from './ee2320/sequential.js';

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
  // Design tasks, graded by simulating what the learner builds.
  dividerDesign,
  opAmpGainDesign,
  rcTimeConstantDesign,
  // The cross-course prerequisites. Without items here the graph can infer that
  // a circuits failure is really a calculus failure but can never confirm it,
  // which leaves the central claim of the app untested.
  ...CALCULUS_GENERATORS,
  ...ODE_GENERATORS,
  ...LINEAR_ALGEBRA_GENERATORS,
  // Discrete maths and digital logic. Built together because they are the same
  // Boolean algebra in two notations, and kept as separate courses because
  // which notation a weakness shows up in is itself the diagnosis.
  ...MATH2358_LOGIC_GENERATORS,
  ...MATH2358_SET_GENERATORS,
  ...MATH2358_COUNTING_GENERATORS,
  ...MATH2358_GRAPH_GENERATORS,
  ...EE2320_NUMBER_GENERATORS,
  ...EE2320_LOGIC_GENERATORS,
  ...EE2320_BLOCK_GENERATORS,
  ...EE2320_SEQUENTIAL_GENERATORS,
];

export const generatorById = (id: string): Generator | undefined =>
  GENERATORS.find((g) => g.id === id);

/**
 * The course a generator belongs to: the one owning its highest-weighted KC.
 *
 * Generators deliberately span courses — a forced first-order ODE is 80%
 * differential equations and 20% exponentials, and recording both is what lets
 * mastery propagate across the boundary. But *membership* has to be singular.
 * Matching on any referenced KC put the same item, with the same id, into two
 * packs, and an item loaded twice is counted twice by the CAT engine: the
 * duplicate-stem guard in `buildItems` catches this within a pack and cannot
 * see across them. Primary attribution is already what `difficultyB` and the
 * title describe, so it is the honest place to draw the line.
 */
export const primaryCourse = (generator: Generator): string => {
  const dominant = [...generator.kcRefs].sort((a, b) => b.weight - a.weight)[0];
  return (dominant?.kc.split('.')[0] ?? '').toUpperCase();
};

export const generatorsForCourse = (course: string): Generator[] =>
  GENERATORS.filter((g) => primaryCourse(g) === course.toUpperCase());
