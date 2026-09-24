// EE 3300 first-order energy items — PERSONAL-ONLY.
//
// Derived from the Nilsson and Riedel chapter 7 homework set assigned through
// Pearson Mastering. That is why this pack is personal-only: it is gitignored,
// rejected from any redistributable pack by the schema, and bundled only under
// VITE_ET_INCLUDE_PERSONAL=1.
//
// The scenarios, component values and wording below are written independently.
// What is taken from the source is the *shape of the question*, which is what
// makes this worth doing: the assigned set asks almost nothing in the form the
// generators already cover. It asks for energy delivered to one named resistor
// over all time, for the number of time constants needed to deliver a stated
// fraction of that energy, and for the percentage dissipated by a stated
// instant — and every one of those turns on a fact the bank could not test.
//
// That fact is the factor of two. Current and voltage decay with time constant
// tau, but power goes as their square, so *energy* decays with tau/2 and the
// fraction delivered by time t is 1 - e^(-2t/tau). A learner who uses
// 1 - e^(-t/tau) gets a plausible percentage, every time, and no item in the
// shared bank would notice. The Exam 1 review deck names first-order circuits
// alongside second-order, so this is examinable on Monday.
import { writeFileSync } from 'node:fs';

let n = 0;
const item = (kc, difficultyB, stem, value, unit, tolerance, traps, steps, principle, hints) => {
  n += 1;
  return {
    id: `ee3300.nilsson.${String(n).padStart(3, '0')}`,
    type: 'numeric',
    kcRefs: [{ kc, weight: 1.0 }],
    difficultyB,
    stem,
    answer: { kind: 'numeric', value, unit, tolerance },
    options: [],
    misconceptionTraps: traps,
    explanation: { steps, principle, hints },
    provenance: { producer: 'hand', sourceRef: 'ee3300-nilsson-ch7', licenseTier: 'personal-only' },
  };
};
const trap = (misconception, value, feedback, tolerance = { rel: 0.02 }) =>
  ({ misconception, value, tolerance, feedback });

const items = [
  // ---- Energy delivered over all time ---------------------------------
  item('ee2300.capacitor-iv', 0.2,
    'A $0.4\\,\\mathrm{{\\mu}F}$ capacitor is charged to $50\\,\\mathrm{V}$ and then discharged through a single $1\\,\\mathrm{k\\Omega}$ resistor.\n\nWhat is the **total** energy delivered to the resistor, in joules?',
    5e-4, 'J', { rel: 0.02 },
    [
      trap('energy.half-dropped', 1e-3, 'The stored energy is $\\tfrac12 CV^{2}$. The half comes from integrating $v\\,dq$ as the capacitor charges, and it does not go away on discharge.'),
      trap('energy.not-squared', 1e-5, 'The voltage is squared. $CV$ is a charge, in coulombs, not an energy.'),
    ],
    [
      'Over all time the capacitor gives up everything it holds, and the resistor is the only place for it to go.',
      '$w = \\tfrac12 CV_0^{2} = \\tfrac12(0.4 \\times 10^{-6})(50)^{2}$.',
      '$w = 5 \\times 10^{-4}\\,\\mathrm{J}$, or $500\\,\\mathrm{{\\mu}J}$.',
      'Notice what the resistance never did: it sets *how fast* the energy leaves, not how much there is.',
    ],
    'The total energy delivered to a single discharge resistor is the whole of the initial stored energy, independent of the resistance. The resistance sets only the rate.',
    ['What is the initial stored energy?', 'Where else could the energy go?']),

  item('ee2300.first-order-natural', 0.7,
    'A capacitor discharges through a resistor with time constant $\\tau$.\n\nHow many time constants does it take to deliver $83\\%$ of the total energy to the resistor? Express the answer as a multiple of $\\tau$.',
    0.8861, '', { rel: 0.02 },
    [
      trap('energy.time-constant-not-halved', 1.7720, 'That is the answer for a quantity decaying as $e^{-t/\\tau}$. Energy goes as the **square** of the voltage, so it decays as $e^{-2t/\\tau}$ and reaches any given fraction in half the time.'),
      trap('transient.decay-form-misapplied', 0.1863, 'Solve $1 - e^{-2n} = 0.83$, not $e^{-2n} = 0.83$. The fraction *delivered* rises towards one; it is the fraction *remaining* that decays.'),
    ],
    [
      'Power in the resistor is $v^{2}/R$, and $v = V_0e^{-t/\\tau}$, so the power goes as $e^{-2t/\\tau}$.',
      'Integrating, the fraction of the total energy delivered by time $t$ is $1 - e^{-2t/\\tau}$.',
      'Set $1 - e^{-2n} = 0.83$, so $e^{-2n} = 0.17$ and $n = -\\tfrac12\\ln(0.17)$.',
      '$n = 0.886$, so it takes $0.886\\tau$.',
    ],
    'Energy decays at twice the rate of the variable that carries it, because power is a square. Half the time constant, every time.',
    ['What does the power go as, if the voltage goes as e^(-t/tau)?', 'Is 83% the fraction delivered or the fraction left?']),

  item('ee2300.first-order-natural', 0.9,
    'A capacitor discharges through a resistor with time constant $\\tau$.\n\nHow many time constants does it take to deliver $90\\%$ of the total energy? Express the answer as a multiple of $\\tau$.',
    1.1513, '', { rel: 0.02 },
    [
      trap('energy.time-constant-not-halved', 2.3026, 'Energy decays as $e^{-2t/\\tau}$, not $e^{-t/\\tau}$ — the power is a square. Halve it.'),
    ],
    [
      'The fraction delivered by time $t$ is $1 - e^{-2t/\\tau}$.',
      '$e^{-2n} = 0.10$, so $n = -\\tfrac12\\ln(0.10) = \\tfrac12(2.3026)$.',
      '$n = 1.151$, so it takes $1.15\\tau$.',
    ],
    'Ninety percent of the energy is gone in well under two time constants, which is why a first-order circuit looks settled long before its voltage has actually reached zero.',
    ['Write the delivered fraction first.', 'Remember the factor of two.']),

  item('ee2300.first-order-natural', 0.5,
    'An $RC$ circuit has a time constant of $2\\,\\mathrm{ms}$ and is discharging.\n\nWhat percentage of the initially stored energy has been dissipated $5\\,\\mathrm{ms}$ after the switch opens? Give the percentage.',
    99.33, '', { rel: 0.02 },
    [
      trap('energy.percentage-from-voltage-decay', 91.79, 'That uses $1 - e^{-t/\\tau}$, which is the fraction the **voltage** has fallen by. Energy goes as $v^{2}$, so the exponent carries a factor of two: $1 - e^{-2t/\\tau}$.'),
      trap('transient.decay-form-misapplied', 0.6738, 'That is the fraction **remaining**, $e^{-2t/\\tau}$. The question asks how much has gone.'),
    ],
    [
      '$t/\\tau = 5/2 = 2.5$.',
      'The fraction dissipated is $1 - e^{-2t/\\tau} = 1 - e^{-5}$.',
      '$e^{-5} = 0.006738$, so the fraction dissipated is $0.99326$.',
      'That is $99.3\\%$.',
    ],
    'Two and a half time constants leaves under one percent of the energy, because the energy exponent is twice the voltage exponent.',
    ['Form 2t/tau, not t/tau.', 'Is the question asking for what has gone or what is left?']),

  // ---- Where the energy goes when there is more than one resistor -----
  item('ee2300.first-order-natural', 0.8,
    'A charged capacitor discharges through a $10\\,\\mathrm{k\\Omega}$ resistor and a $40\\,\\mathrm{k\\Omega}$ resistor connected **in parallel** with it.\n\nWhat percentage of the initial stored energy is dissipated in the $10\\,\\mathrm{k\\Omega}$ resistor?',
    80, '', { rel: 0.02 },
    [
      trap('energy.dissipation-split-inverted', 20, 'The two resistors share the same **voltage**, so power is $v^{2}/R$ and the *smaller* resistance takes the larger share. Splitting in proportion to $R$ is the series rule.'),
      trap('energy.dissipation-split-evenly', 50, 'They only split evenly if they are equal. Here one carries four times the current of the other at every instant.'),
    ],
    [
      'Both resistors sit across the capacitor, so they always have the same voltage $v(t)$.',
      'At every instant $p_{10} = v^{2}/10\\mathrm{k}$ and $p_{40} = v^{2}/40\\mathrm{k}$, so their ratio is fixed at $4:1$ for all time.',
      'A fixed ratio at every instant is the same ratio after integrating, so the $10\\,\\mathrm{k\\Omega}$ takes $4/5$ of the total.',
      'That is $80\\%$.',
    ],
    'Shared voltage means power splits as 1/R; shared current means it splits as R. Which rule applies is decided by the topology, and the two give opposite answers.',
    ['Do these resistors share a voltage or a current?', 'The ratio is constant in time, so no integration is needed.']),

  item('ee2300.first-order-natural', 0.7,
    'An inductor carrying an initial current decays through a $2\\,\\Omega$ resistor and an $8\\,\\Omega$ resistor connected **in series** with it.\n\nWhat percentage of the initial stored energy is dissipated in the $2\\,\\Omega$ resistor?',
    20, '', { rel: 0.02 },
    [
      trap('energy.dissipation-split-inverted', 80, 'A series pair shares the same **current**, so power is $i^{2}R$ and the *larger* resistance takes the larger share. This is the opposite of the parallel case.'),
      trap('energy.dissipation-split-evenly', 50, 'Equal shares would need equal resistances.'),
    ],
    [
      'In series both resistors carry the same current $i(t)$.',
      '$p_2 = i^{2}(2)$ and $p_8 = i^{2}(8)$, a fixed $1:4$ ratio at every instant.',
      'So the $2\\,\\Omega$ resistor takes $2/10$ of the total energy.',
      'That is $20\\%$.',
    ],
    'The same question about a series pair and a parallel pair has opposite answers, and nothing in the wording signals it — only the topology does.',
    ['What do series elements share?', 'Compare this with the parallel case.']),

  // ---- Initial values, and the chain the homework actually asks for ---
  item('ee2300.inductor-iv', -0.3,
    'A $20\\,\\mathrm{mH}$ inductor carries a steady current of $3\\,\\mathrm{A}$ when a switch opens at $t = 0$.\n\nWhat is the energy stored in the inductor at $t = 0$, in joules?',
    0.09, 'J', { rel: 0.02 },
    [
      trap('energy.half-dropped', 0.18, 'The stored energy is $\\tfrac12 Li^{2}$.'),
      trap('energy.not-squared', 0.03, 'The current is squared. $Li$ is a flux linkage, in webers, not an energy.'),
    ],
    [
      '$w = \\tfrac12 Li^{2} = \\tfrac12(0.02)(3)^{2}$.',
      '$w = 0.09\\,\\mathrm{J}$, or $90\\,\\mathrm{mJ}$.',
      'The inductor current cannot jump, so this is also the energy present the instant **after** the switch opens.',
    ],
    'Inductor energy goes with the square of current, and current is the variable that cannot change instantaneously — which is what makes this the right starting point for the transient.',
    ['Which variable is continuous through the switching instant?', 'Check the half.']),

  item('ee2300.first-order-natural', -0.1,
    'After a switch opens, a $20\\,\\mathrm{mH}$ inductor is left in a loop with a $2\\,\\Omega$ and an $8\\,\\Omega$ resistor in series.\n\nWhat is the time constant of the circuit for $t > 0$, in seconds?',
    2e-3, 's', { rel: 0.02 },
    [
      trap('filter.time-constant-inverted', 500, '$\\tau = L/R$ has units of seconds; $R/L$ is its reciprocal, in $\\mathrm{s^{-1}}$.'),
      trap('transient.resistances-added', 1e-2, 'The resistors are in series with the inductor, so the resistance it sees is their **sum**, $10\\,\\Omega$ — not either one alone.'),
    ],
    [
      'For $t > 0$ the inductor sees $2 + 8 = 10\\,\\Omega$.',
      '$\\tau = L/R = 0.02/10$.',
      '$\\tau = 2 \\times 10^{-3}\\,\\mathrm{s} = 2\\,\\mathrm{ms}$.',
    ],
    'The time constant uses the resistance seen from the energy-storing element after the switching, which is rarely the resistance that was there before it.',
    ['Redraw the circuit for t > 0 before computing anything.', 'Is it L/R or R/L?']),

  item('ee2300.first-order-natural', 0.4,
    'An inductor storing $0.09\\,\\mathrm{J}$ decays through a resistor.\n\nHow much energy has been dissipated after two time constants, in joules?',
    0.08835, 'J', { rel: 0.02 },
    [
      trap('energy.time-constant-not-halved', 0.07782, 'That uses $1 - e^{-2}$. Energy decays as $e^{-2t/\\tau}$, so at $t = 2\\tau$ the exponent is $-4$.'),
      trap('transient.decay-form-misapplied', 0.001648, 'That is the energy **remaining**, not the energy dissipated.'),
    ],
    [
      'The fraction dissipated by time $t$ is $1 - e^{-2t/\\tau}$.',
      'At $t = 2\\tau$ that is $1 - e^{-4} = 1 - 0.01832 = 0.98168$.',
      '$w = 0.98168 \\times 0.09 = 0.08835\\,\\mathrm{J}$.',
    ],
    'Two time constants is already 98% of the energy, which is the practical reason "five time constants" is treated as settled.',
    ['The exponent is 2t/tau.', 'Multiply the fraction by the initial stored energy.']),

  // ---- Reading a response back -----------------------------------------
  item('ee2300.first-order-natural', 0.1,
    'A first-order circuit has the natural response $v_o(t) = 2e^{-25000t}\\,\\mathrm{V}$ for $t \\geq 0$, with $t$ in seconds.\n\nWhat is $v_o$ at $t = 40\\,\\mathrm{{\\mu}s}$, in volts?',
    0.7358, 'V', { rel: 0.02 },
    [
      trap('unit-conversion.microseconds-unconverted', 2.0, 'Forty **microseconds** is $40 \\times 10^{-6}\\,\\mathrm{s}$. Substituting 40 makes the exponent $-10^{6}$ and the answer indistinguishable from zero.'),
      trap('transient.decay-form-misapplied', 1.2642, 'That is $2(1 - e^{-1})$, the step-response form. This response decays from 2 towards 0; it does not rise towards 2.'),
    ],
    [
      'The coefficient of $t$ is $1/\\tau$, so $\\tau = 1/25000 = 40\\,\\mathrm{{\\mu}s}$.',
      'The instant asked for is exactly one time constant.',
      '$v_o = 2e^{-1} = 2(0.3679) = 0.736\\,\\mathrm{V}$.',
    ],
    'Reading the time constant straight off the exponent is faster than recovering R and C, and it is the check that catches an arithmetic slip in either of them.',
    ['What is the time constant, read off the exponent?', 'Convert the microseconds before substituting.']),

  item('ee2300.first-order-natural', 0.3,
    'A capacitor discharges through a resistor with time constant $\\tau$.\n\nWhat percentage of the initial stored energy is **still on the capacitor** at $t = \\tau$?',
    13.53, '', { rel: 0.02 },
    [
      trap('energy.time-constant-not-halved', 36.79, 'That is $e^{-1}$, the fraction the **voltage** has left. The energy is $\\tfrac12 Cv^{2}$, so it retains $e^{-2}$ of its initial value.'),
      trap('transient.decay-form-misapplied', 86.47, 'That is the fraction dissipated, $1 - e^{-2}$. The question asks what remains.'),
    ],
    [
      'At $t = \\tau$ the voltage is $V_0e^{-1} = 0.3679V_0$.',
      'Energy goes as the square: $w(\\tau)/w(0) = (e^{-1})^{2} = e^{-2}$.',
      '$e^{-2} = 0.1353$, so $13.5\\%$ remains.',
    ],
    'One time constant leaves 37% of the voltage and only 14% of the energy. Squaring a fraction below one makes it smaller, which is the whole of the factor of two.',
    ['What fraction of the voltage is left at one time constant?', 'Now square it.']),

  item('ee2300.capacitor-iv', 0.5,
    'A capacitor charged to $50\\,\\mathrm{V}$ delivers a total of $500\\,\\mathrm{{\\mu}J}$ to a resistor as it fully discharges.\n\nWhat is its capacitance, in farads?',
    4e-7, 'F', { rel: 0.02 },
    [
      trap('energy.half-dropped', 2e-7, 'Inverting $w = \\tfrac12 CV^{2}$ gives $C = 2w/V^{2}$. Dropping the two halves the answer.'),
      trap('energy.not-squared', 2e-5, 'The voltage is squared in the energy, so it stays squared when the expression is inverted.'),
    ],
    [
      'All the stored energy ends up in the resistor, so $w = \\tfrac12 CV_0^{2} = 500\\,\\mathrm{{\\mu}J}$.',
      '$C = \\dfrac{2w}{V_0^{2}} = \\dfrac{2(5 \\times 10^{-4})}{2500}$.',
      '$C = 4 \\times 10^{-7}\\,\\mathrm{F} = 0.4\\,\\mathrm{{\\mu}F}$.',
    ],
    'The resistance is absent from this calculation, which is the same point as the first item read backwards: total energy depends only on the storage element and its initial condition.',
    ['Invert the stored-energy expression.', 'Does the resistance appear at all?']),
];

const pack = {
  schemaVersion: '1.0.0',
  packId: 'ee3300-nilsson-v1',
  version: 1,
  course: 'EE2300',
  title: 'First-order energy questions in the assigned homework style',
  provenance: {
    producer: 'hand',
    sourceRef: 'ee3300-nilsson-ch7',
    licenseTier: 'personal-only',
    createdAt: '1970-01-01T00:00:00.000Z',
  },
  items,
};
writeFileSync('content/inbox/ee3300-nilsson-v1.json', `${JSON.stringify(pack, null, 2)}\n`);
console.log('wrote', items.length, 'personal-only items');
