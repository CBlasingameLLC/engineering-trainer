// PHYS 2335 tutorial items — PERSONAL-ONLY.
//
// Derived from the McDermott/Shaffer *Tutorials in Introductory Physics*
// homework, which is Pearson Custom Publishing material. That is why this pack
// is personal-only: it is gitignored, rejected from any redistributable pack
// by the schema, and bundled only under VITE_ET_INCLUDE_PERSONAL=1.
//
// What makes the tutorials worth this trouble is that they are built around
// documented student errors rather than around topics. A generic distractor
// names a mistake somebody might make; these name the ones this curriculum has
// measured students making, which is what the misconception feed needs to rank
// anything usefully.
//
// The scenarios and wording below are written independently. What is taken
// from the source is the *error being targeted*, which is not a form of
// expression.
import { writeFileSync } from 'node:fs';

let n = 0;
const item = (kc, difficultyB, stem, options, correctId, steps, principle, hints) => {
  n += 1;
  return {
    id: `phys2335.tutorial.${String(n).padStart(3, '0')}`,
    type: 'multiple-choice',
    kcRefs: [{ kc, weight: 1.0 }],
    difficultyB,
    stem,
    answer: { kind: 'choice', correctId },
    options,
    misconceptionTraps: [],
    explanation: { steps, principle, hints },
    provenance: { producer: 'hand', sourceRef: 'phys2335-tutorials', licenseTier: 'personal-only' },
  };
};
const o = (id, text, misconception) => (misconception ? { id, text, misconception } : { id, text });

const items = [
  // ---- Pressure in a liquid -------------------------------------------
  item('phys2335.fluid-pressure-depth', -0.2,
    'A U-tube is filled with water and **sealed** at the top of the right arm; the left arm is open to the air. The sealed point sits above the water surface in the open arm. Is the pressure at the sealed point greater than, less than, or equal to atmospheric?',
    [
      o('a', 'Less than atmospheric'),
      o('b', 'Greater than atmospheric, since the water pushes up against the stopper', 'fluids.pressure-assumed-above-atmospheric'),
      o('c', 'Equal to atmospheric, since the tube is connected to the open arm', 'fluids.connection-implies-equal-pressure'),
      o('d', 'Cannot be determined without the height of the tube', 'fluids.underdetermined-assumed'),
    ], 'a',
    [
      'Start from a point in the water at the same height as the open surface. There the pressure is atmospheric.',
      'Moving **upward** through a fluid, pressure **falls** by $\\rho g h$ — the same rule as $P = P_0 + \\rho g h$ read in the other direction.',
      'The sealed point is above that level, so its pressure is atmospheric minus $\\rho g h$, which is less than atmospheric.',
      'Nothing forbids this. A sealed end can hold a pressure below atmospheric, and the stopper then experiences a net inward force — which is precisely how a drinking straw works.',
    ],
    'Pressure is not bounded below by atmospheric. Going up in a fluid lowers it, and a closed end lets it go lower than the outside air.',
    ['What happens to pressure as you move upward through a fluid?', 'Is there any rule saying pressure cannot fall below atmospheric?']),

  item('phys2335.fluid-pressure-depth', 0.1,
    'In that same sealed U-tube, the water level in the **open** arm is slowly lowered while the level in the sealed arm does not move. What happens to the pressure at the sealed point at the top?',
    [
      o('a', 'It decreases'),
      o('b', 'It increases, because the trapped gas is compressed', 'fluids.sealed-gas-assumed-compressed'),
      o('c', 'It stays the same, because the sealed arm did not move', 'fluids.sealed-side-assumed-independent'),
      o('d', 'It stays the same, because pressure depends only on depth', 'fluids.depth-only-reasoning'),
    ], 'a',
    [
      'The pressure at the sealed point is the atmospheric pressure at the open surface, less $\\rho g h$ for the height difference between that surface and the sealed point.',
      'Lowering the open surface increases that height difference while leaving the atmosphere unchanged.',
      'So $\\rho g h$ grows and the sealed pressure falls further below atmospheric.',
      'Push this far enough and the pressure at the top reaches zero, at which point the water column can no longer be supported — the height at which that happens is the barometric limit, about 10 m for water.',
    ],
    'The sealed side is not independent of the open side; they are one connected fluid. What changed is the height difference between them, and that is the only thing the pressure difference depends on.',
    ['What sets the pressure at the sealed point in the first place?', 'What is changing when the open level drops?']),

  item('phys2335.manometer', 0.25,
    'A U-tube holds water. Oil, less dense than water, is poured into the **left** arm and floats on the water there. Points $A$ (left, in the oil-water region) and $B$ (right, in water) are at the **same height**, and water connects them along the bottom. How do the pressures compare?',
    [
      o('a', 'They are equal'),
      o('b', 'The pressure at $A$ is lower, because oil is less dense than water', 'fluids.same-level-density-reasoning'),
      o('c', 'The pressure at $A$ is higher, because it carries two fluids above it', 'fluids.column-count-reasoning'),
      o('d', 'They cannot be compared without the column heights', 'fluids.underdetermined-assumed'),
    ], 'a',
    [
      'Pressure is equal at any two points at the same height **within one connected body of the same fluid** — otherwise fluid at that level would accelerate sideways.',
      '$A$ and $B$ are at the same height and are joined by a continuous path through the water at the bottom, so that condition applies directly.',
      'What the oil changes is not this equality but the **heights** of the two surfaces: to press equally hard at $A$, the lighter oil needs a taller column.',
      'So the pressures at $A$ and $B$ match, and the oil surface ends up sitting **above** the water surface on the other side.',
    ],
    'The equal-pressure rule is about a horizontal line through one connected fluid, not about what is stacked above each arm. Densities decide the heights, not the equality.',
    ['Is there a continuous path of the same fluid between the two points?', 'If the pressures are equal, what must differ instead?']),

  item('phys2335.manometer', 0.3,
    'In that oil-on-water U-tube, once everything settles, where does the top surface of the **oil** sit relative to the top surface of the water in the other arm?',
    [
      o('a', 'Above it'),
      o('b', 'Below it, since the lighter fluid cannot push the heavier one as high', 'fluids.lighter-fluid-sits-lower'),
      o('c', 'Level with it, since both arms are open to the atmosphere', 'fluids.open-arms-assumed-level'),
      o('d', 'It depends on how much oil was poured in', 'fluids.surface-height-assumed-volume-dependent'),
    ], 'a',
    [
      'At the level where the oil meets the water, the pressure must equal the pressure at the same height in the other arm.',
      'Both arms are open, so both start from atmospheric at their top surface and add $\\rho g h$ going down.',
      'Matching those contributions gives $\\rho_{\\text{oil}} h_{\\text{oil}} = \\rho_{\\text{water}} h_{\\text{water}}$; with the smaller density on the left, the left height must be larger.',
      'So the oil surface stands higher. More oil raises both the interface and the oil surface, but the *ratio* of heights is fixed by the densities alone.',
    ],
    'Equal pressure with unequal density forces unequal height, and the lighter fluid is always the taller column. That is the same statement as a floating object riding high.',
    ['What quantity has to match at the oil-water interface?', 'Which column must be taller to press equally hard?']),

  item('phys2335.fluid-pressure-depth', 0.0,
    'A W-shaped tube is partly filled with water and is open to the air at one end. A point $W$ sits in the water **above** the height of that open surface. How does the pressure at $W$ compare with atmospheric?',
    [
      o('a', 'Less than atmospheric'),
      o('b', 'Greater than atmospheric, since $W$ is under water', 'fluids.under-water-implies-above-atmospheric'),
      o('c', 'Equal to atmospheric, since the water is open to the air', 'fluids.connection-implies-equal-pressure'),
      o('d', 'Greater than atmospheric, since water is denser than air', 'fluids.density-implies-pressure'),
    ], 'a',
    [
      'Being submerged does not by itself mean the pressure exceeds atmospheric. What matters is the height relative to the open surface.',
      'At the open surface the pressure is atmospheric. Moving up from that level through the water reduces it by $\\rho g h$.',
      '$W$ is above the open surface, so its pressure is below atmospheric.',
      'The same reasoning applied downward gives the familiar result: a point below the open surface is above atmospheric. The rule is about height, not about being wet.',
    ],
    'Depth is measured from the free surface that is open to the atmosphere. "Inside the liquid" and "below the surface" are different statements, and only the second raises the pressure.',
    ['Which reference height does the atmosphere set the pressure at?', 'Is the point above or below that height?']),

  // ---- The ideal gas law ----------------------------------------------
  item('phys2335.ideal-gas-law', 0.35,
    'A vertical cylinder of ideal gas is sealed by a heavy piston that slides without friction. A valve at the bottom is opened, some gas escapes slowly, and the valve is closed again. The piston ends up lower. The gas stays in thermal equilibrium with the room throughout. How does the final gas pressure compare with the initial?',
    [
      o('a', 'Equal to it'),
      o('b', 'Greater, because the volume decreased', 'gas.pressure-from-volume-alone'),
      o('c', 'Less, because gas escaped', 'gas.pressure-from-amount-alone'),
      o('d', 'Cannot be determined from the information given', 'gas.underdetermined-assumed'),
    ], 'a',
    [
      'Do not start from the gas law. Start from the piston, which is in equilibrium both before and after.',
      'The forces on it are its weight, the atmosphere pushing down, and the gas pushing up. Balancing them gives $P_{\\text{gas}} = P_0 + \\dfrac{mg}{A}$.',
      'None of those three quantities changed, so the gas pressure is the same at the end as at the start.',
      'The gas law is still satisfied: $n$ fell, $T$ was constant, and $V$ fell in proportion. It is the piston that **sets** the pressure, and the gas law that then tells you the volume.',
    ],
    'The ideal gas law is a constraint among four quantities, not a causal story. Something physical has to set one of them, and here it is the mechanical equilibrium of the piston.',
    ['What is the piston doing, mechanically, before and after?', 'Which quantity does the gas law leave free once P, n and T are known?']),

  item('phys2335.ideal-gas-law', 0.5,
    'A student says: "In the ideal gas law $P = nRT/V$, pressure is inversely proportional to volume. The volume went down, so the pressure must have gone up." What exactly is wrong with this reasoning?',
    [
      o('a', 'Inverse proportionality between $P$ and $V$ only holds if $n$ and $T$ are held fixed, and here $n$ changed'),
      o('b', 'Nothing is wrong with the reasoning; the conclusion is correct', 'gas.proportional-reasoning-accepted'),
      o('c', 'The ideal gas law does not apply to a gas that is escaping', 'gas.law-assumed-inapplicable'),
      o('d', 'The error is using $R$ instead of $k_B$', 'gas.constant-confused'),
    ], 'a',
    [
      'A proportionality read off an equation with four variables is a statement about holding the others constant. Written out, $P \\propto 1/V$ requires *at fixed $n$ and $T$*.',
      'In this process gas escaped, so $n$ fell. The quantity that actually stayed fixed was $P$, set by the piston.',
      'With $P$ and $T$ fixed and $n$ falling, the law gives $V = nRT/P$, so the volume falls in proportion to the amount — which is exactly what was observed.',
      'The equation was never violated. What was violated is the unstated condition attached to the proportionality.',
    ],
    'Every "X is proportional to Y" pulled out of a multi-variable relation carries a hidden "with everything else fixed". Checking what is actually fixed is the whole skill.',
    ['How many quantities in the gas law are free to change here?', 'Which one was actually held constant, and by what?']),

  item('phys2335.ideal-gas-law', 0.2,
    'In that same escaping-gas process — free piston, constant room temperature — which quantities in $PV = nRT$ are held constant?',
    [
      o('a', '$P$ and $T$; both $V$ and $n$ change'),
      o('b', '$n$ and $T$; only $V$ and $P$ change', 'gas.amount-assumed-fixed'),
      o('c', '$T$ and $V$; only $P$ and $n$ change', 'gas.volume-assumed-fixed'),
      o('d', 'Only $T$; all three others change independently', 'gas.pressure-assumed-free'),
    ], 'a',
    [
      '$T$ is constant because the cylinder stays in thermal equilibrium with the room, which is stated.',
      '$P$ is constant because the piston is free and its force balance did not change — that is the mechanical argument, not a gas-law one.',
      '$n$ decreased: gas was deliberately let out through the valve.',
      '$V$ decreased: the piston was observed to end lower. With two quantities fixed and two falling together, the law is satisfied throughout.',
    ],
    'Identifying what is held constant is the first step of every gas problem, and it usually comes from the apparatus rather than from the equation.',
    ['What in the setup pins the temperature?', 'What in the setup pins the pressure?']),

  item('phys2335.ideal-gas-law', 0.45,
    'The piston is now **pinned** in place so it cannot move, and the whole cylinder is lowered into boiling water. Why can the pressure no longer be found from the free-body diagram of the piston?',
    [
      o('a', 'The pin exerts an unknown force on the piston, so the balance no longer determines the gas pressure'),
      o('b', 'The piston is not in equilibrium once it is pinned', 'gas.pinned-piston-not-equilibrium'),
      o('c', 'The free-body method only works at room temperature', 'gas.method-assumed-temperature-limited'),
      o('d', 'The pressure is undefined while the gas is being heated', 'gas.pressure-assumed-undefined'),
    ], 'a',
    [
      'The piston is still in equilibrium — pinned things are, very reliably. That is not the problem.',
      'The problem is that the balance now contains four terms rather than three: weight, atmosphere, gas, and the force from the pin.',
      'One equation with two unknowns — the gas pressure and the pin force — determines neither.',
      'What the pin does give you is the volume: it is fixed. So this process is the constant-volume one, and heating the gas raises its pressure, with the pin absorbing the difference.',
    ],
    'A constraint that fixes one variable usually introduces an unknown force alongside it. Which method works depends on which of those you can measure.',
    ['Is the pinned piston in equilibrium?', 'How many unknown forces are now in the balance?']),

  item('phys2335.ideal-gas-law', 0.3,
    'With the piston pinned and the cylinder placed in boiling water, what happens to the gas?',
    [
      o('a', 'Temperature and pressure both rise; the volume is unchanged'),
      o('b', 'Temperature rises and the gas expands, pushing against the pin', 'gas.pinned-gas-assumed-expanding'),
      o('c', 'Temperature rises and pressure is unchanged, as in the free-piston case', 'gas.pressure-assumed-unchanged-when-pinned'),
      o('d', 'Temperature rises and pressure falls, since the gas is less dense than the water', 'gas.pressure-from-density'),
    ], 'a',
    [
      'The gas comes to the temperature of its surroundings, so $T$ rises to the boiling point of the water.',
      'The pin holds the piston, so the volume cannot change: $V$ is constant.',
      'With $n$ and $V$ fixed, $PV = nRT$ gives $P \\propto T$ — and *here* that proportionality is legitimate, because the two quantities it holds fixed genuinely are fixed.',
      'On a $PV$ diagram this is a vertical line: pressure climbing at constant volume.',
    ],
    'The same equation gives a different answer in the two setups, and the difference is entirely in what the apparatus holds fixed. The gas law never decides that by itself.',
    ['What does the pin fix?', 'Which proportionality is legitimate once you know what is held constant?']),
];

const pack = {
  schemaVersion: '1.0.0',
  packId: 'phys2335-tutorials-v1',
  version: 1,
  course: 'PHYS2335',
  title: 'Waves and Heat tutorial reasoning',
  provenance: {
    producer: 'hand',
    sourceRef: 'phys2335-tutorials',
    licenseTier: 'personal-only',
    createdAt: '1970-01-01T00:00:00.000Z',
  },
  items,
};
writeFileSync('content/inbox/phys2335-tutorials-v1.json', `${JSON.stringify(pack, null, 2)}\n`);
console.log('wrote', items.length, 'personal-only items');
