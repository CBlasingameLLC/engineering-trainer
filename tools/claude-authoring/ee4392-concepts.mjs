// Authoring script for the EE 4392 conceptual pack.
//
// These items cover standard semiconductor-process knowledge — the kind found
// in Plummer, Campbell or Sze — written independently. The course syllabus
// prohibits redistributing the instructor's own materials, so no checklist
// question, slide phrasing or exam item is reproduced here; what is shared
// with the course is the subject matter, which is not the instructor's to
// license.
import { writeFileSync } from 'node:fs';

let n = 0;
const item = (kc, difficultyB, stem, options, correctId, steps, principle, hints, extraKc) => {
  n += 1;
  return {
    id: `ee4392.concept.${String(n).padStart(3, '0')}`,
    type: 'multiple-choice',
    kcRefs: extraKc ? [{ kc, weight: 0.7 }, { kc: extraKc, weight: 0.3 }] : [{ kc, weight: 1.0 }],
    difficultyB,
    stem,
    answer: { kind: 'choice', correctId },
    options,
    misconceptionTraps: [],
    explanation: { steps, principle, hints },
    provenance: { producer: 'hand', sourceRef: 'ee4392-concepts', licenseTier: 'redistributable' },
  };
};
const o = (id, text, misconception) => (misconception ? { id, text, misconception } : { id, text });

const items = [
  // ---- Oxidation -------------------------------------------------------
  item('ee4392.oxidation-mechanism', -0.9,
    'Wet oxidation grows silicon dioxide considerably faster than dry oxidation at the same temperature. What is the underlying reason?',
    [
      o('a', 'Water vapour dissolves into the oxide at a much higher equilibrium concentration than oxygen does'),
      o('b', 'Water vapour reacts with silicon at a lower activation energy, so the interface reaction is faster', 'oxidation.wet-rate-blamed-on-reaction'),
      o('c', 'The hydrogen released during wet growth physically opens channels through the oxide', 'oxidation.wet-rate-blamed-on-hydrogen'),
      o('d', 'Wet oxidation runs at higher furnace pressure', 'oxidation.wet-rate-blamed-on-pressure'),
    ], 'a',
    [
      'Both ambients have to get oxidant through the oxide already grown before any new oxide can form.',
      'The rate that transport supports depends on $C^{*}$, the equilibrium concentration of oxidant dissolved in the oxide — Henry\'s law applied at the surface.',
      '$C^{*}$ for $\\mathrm{H_2O}$ is roughly three orders of magnitude larger than for $\\mathrm{O_2}$, so far more oxidant per unit time reaches the interface.',
      'That shows up in the model as a much larger $B$ — wet growth is faster because more oxidant is available to diffuse, not because the reaction is easier.',
    ],
    'Both rate constants trace back to a physical step. B is about transport through the oxide; B/A is about the reaction at the interface.',
    ['Which of the two rate constants differs most between wet and dry?', 'What has to happen before oxidant can react at all?']),

  item('ee4392.oxidation-mechanism', -0.7,
    'Gate oxides are grown dry even though dry oxidation is much slower. Why is the slower process preferred here?',
    [
      o('a', 'Dry oxide is denser and carries fewer traps and defects, which a thin gate dielectric cannot tolerate'),
      o('b', 'Dry oxide grows more uniformly across the wafer than wet oxide', 'oxidation.dry-chosen-for-uniformity'),
      o('c', 'Wet oxidation cannot produce films thin enough for a gate', 'oxidation.dry-chosen-for-thickness-limit'),
      o('d', 'Dry oxidation consumes less silicon per unit of oxide grown', 'oxidation.dry-chosen-for-consumption'),
    ], 'a',
    [
      'A gate oxide is the thinnest and most electrically stressed film on the wafer: it must hold off a field near $10^{7}\\ \\mathrm{V/cm}$ and must not trap charge.',
      'Wet growth incorporates hydrogen and leaves a more open network, which shows up as a higher defect and trap density.',
      'Dry growth is slower precisely because less oxidant is available, and the film it leaves is denser and more nearly stoichiometric.',
      'Being slow is acceptable when the target is only a few nanometres, so dry is the right trade for a gate and the wrong one for a field oxide.',
    ],
    'Growth rate and film quality pull in opposite directions, and which one matters is decided by what the oxide is for.',
    ['What is a gate oxide asked to do electrically?', 'Is growth time a real cost at gate-oxide thicknesses?']),

  item('ee4392.deal-grove-model', 0.2,
    'The Deal-Grove derivation sets three fluxes equal and then discards the first. What assumption justifies dropping the gas-phase flux $F_1$?',
    [
      o('a', 'The ambient is well mixed, so the oxidant concentration at the oxide surface stays at its equilibrium value'),
      o('b', 'The gas-phase flux is negligible because gases diffuse slowly compared with solids', 'deal-grove.f1-dropped-as-slow'),
      o('c', '$F_1$ is already included in the parabolic rate constant $B$', 'deal-grove.f1-folded-into-b'),
      o('d', 'The furnace is evacuated, so there is no gas phase to transport through', 'deal-grove.f1-dropped-as-vacuum'),
    ], 'a',
    [
      'Gas-phase transport to the wafer is fast compared with diffusion through a solid oxide and with the interface reaction.',
      'So the surface concentration never becomes depleted: $C_0$ stays pinned at the Henry\'s-law value $C^{*}$.',
      'With $C_0 = C^{*}$ fixed, $F_1$ carries no information and drops out of the analysis.',
      'This is why gas flow rate, wafer spacing and wafer orientation in the boat have essentially no effect on growth rate — a prediction the model makes and experiment confirms.',
    ],
    'A flux that is never rate-limiting can be removed from a steady-state chain without changing the answer. Deciding which one that is, is most of the modelling.',
    ['Which of the three steps is fastest?', 'What would have to be true for gas flow rate to matter?']),

  item('ee4392.deal-grove-model', 0.3,
    'Why does the linear rate constant $B/A$ depend on substrate crystal orientation while the parabolic constant $B$ does not?',
    [
      o('a', '$B/A$ is set by the interface reaction, which depends on available bond sites; $B$ is set by diffusion through an amorphous film that has no lattice'),
      o('b', '$B$ does depend on orientation, but the dependence is too weak to tabulate', 'deal-grove.b-orientation-dependence-assumed'),
      o('c', '$B/A$ varies because thin oxides are partly crystalline and inherit the substrate lattice', 'deal-grove.thin-oxide-assumed-crystalline'),
      o('d', 'Orientation changes the oxide density, which changes the linear constant only', 'deal-grove.orientation-changes-density'),
    ], 'a',
    [
      '$B/A = k_s C^{*}/N_1$ is governed by $k_s$, the rate of the reaction at the silicon surface.',
      'That reaction consumes silicon atoms at the interface, so its rate depends on how densely those atoms are packed on the exposed plane — $(111)$ is the densest and reacts fastest.',
      '$B = 2DC^{*}/N_1$ is governed by $D$, the diffusivity of oxidant through the oxide already grown.',
      'That oxide is amorphous, so it has no orientation to inherit and $D$ cannot depend on the substrate plane. Correct $B/A$ for orientation and never $B$.',
    ],
    'Each rate constant inherits the symmetry of the physical step behind it. Amorphous films forget the lattice they grew on.',
    ['Which constant describes something happening at the silicon surface?', 'Is the grown oxide crystalline?']),

  item('ee4392.deal-grove-model', 0.0,
    'A thick oxide is being grown. Which step limits the growth rate, and what does the thickness-time relationship look like?',
    [
      o('a', 'Diffusion of oxidant through the existing oxide; thickness goes as the square root of time'),
      o('b', 'The interface reaction; thickness goes linearly with time', 'deal-grove.regimes-inverted'),
      o('c', 'Gas-phase supply of oxidant; thickness saturates', 'deal-grove.thick-limit-gas-phase'),
      o('d', 'Silicon consumption at the interface; thickness goes as the cube root of time', 'deal-grove.thick-limit-consumption'),
    ], 'a',
    [
      'Once the oxide is thick, an oxidant molecule spends most of its journey crossing it, and that crossing is the slow step.',
      'In that limit the $x_0/(B/A)$ term is small beside $x_0^2/B$, so $x_0^2 \\approx Bt$.',
      'Hence $x_0 \\approx \\sqrt{Bt}$, and $B$ is called the parabolic rate constant because $x_0^2$ is linear in $t$.',
      'The opposite limit — a very thin oxide — is reaction-limited and gives $x_0 \\approx (B/A)t$, linear in time.',
    ],
    'The same quadratic contains both regimes. Which term dominates is a statement about how far the oxidant has to travel.',
    ['Which term in the quadratic grows faster as the oxide thickens?', 'Why is B called parabolic?']),

  item('ee4392.oxide-volume-expansion', -0.8,
    'Converting silicon to silicon dioxide expands the volume by about 2.2 times. Where does that extra volume go?',
    [
      o('a', 'Upward: the oxide grows into the ambient, so about 56% of the film stands above the original silicon surface'),
      o('b', 'Laterally, which is why oxide spreads under a nitride mask', 'oxidation.expansion-assumed-lateral'),
      o('c', 'Nowhere — the oxide is compressed to the volume of the silicon it replaced', 'oxidation.expansion-assumed-suppressed'),
      o('d', 'Downward into the substrate, so the wafer thickens', 'oxidation.expansion-assumed-downward'),
    ], 'a',
    [
      'The wafer is laterally constrained and rigid, so the only low-stress direction available to a growing film is normal to the surface.',
      'Oxidation consumes silicon from below the original surface while depositing a film 2.2 times that volume.',
      'The arithmetic gives the familiar split: 44% of the finished oxide thickness lies below the original surface and 56% above it.',
      'A cross-section question is always this split applied to each region of the wafer separately.',
    ],
    'Oxide does not sit on silicon; it replaces some of it and expands. Every recess and step-height calculation follows from that.',
    ['Which direction is unconstrained?', 'If 44% of the oxide came from below the surface, where is the rest?']),

  item('ee4392.oxidation-mechanism', -0.3,
    'A nitride mask patterned on pad oxide produces a "bird\'s beak" at the edge of a LOCOS field oxide. What causes it?',
    [
      o('a', 'Oxidant diffuses laterally through the pad oxide under the nitride edge, growing oxide that lifts the mask'),
      o('b', 'The nitride shrinks during the high-temperature step and exposes silicon at its edge', 'locos.beak-blamed-on-nitride-shrink'),
      o('c', 'Photoresist rounding transfers a tapered edge into the nitride', 'locos.beak-blamed-on-resist'),
      o('d', 'Silicon diffuses out from under the mask and oxidises in the field region', 'locos.beak-blamed-on-si-diffusion'),
    ], 'a',
    [
      'Nitride blocks oxidant, but the pad oxide beneath it does not — it is silicon dioxide, the very medium oxidant diffuses through.',
      'So oxidant arrives sideways under the mask edge and grows oxide there.',
      'That oxide expands, prying the nitride edge upward and producing the tapering wedge the cross-section shows.',
      'The result is lost area at every isolation edge, which is why LOCOS was eventually replaced by shallow trench isolation.',
    ],
    'A mask stops what lands on it, not what arrives from the side. Lateral transport under a mask edge limits every masked thermal process.',
    ['Is the pad oxide a barrier to oxidant?', 'What would make the nitride edge lift?']),

  item('ee4392.oxidation-mechanism', -0.5,
    'Why is a purge gas flowed through an oxidation furnace during loading, unloading and temperature ramps?',
    [
      o('a', 'To displace air and moisture so no uncontrolled oxide grows outside the intended process step'),
      o('b', 'To cool the wafers quickly enough to avoid thermal shock', 'furnace.purge-blamed-on-cooling'),
      o('c', 'To carry particles away from the wafer surface by entrainment', 'furnace.purge-blamed-on-particles'),
      o('d', 'To maintain furnace pressure above atmospheric so contaminants cannot enter', 'furnace.purge-blamed-on-pressure'),
    ], 'a',
    [
      'Silicon at furnace temperature oxidises in whatever oxygen or water vapour is present, whether or not the recipe has started.',
      'An inert purge — nitrogen is the usual choice — displaces those species from the tube.',
      'That keeps the grown thickness equal to what the recipe specifies rather than the recipe plus an uncontrolled contribution from loading.',
      'The same reasoning applies on the way out: a hot wafer in air keeps growing oxide until it cools.',
    ],
    'Thermal processes do not start and stop with the recipe. Controlling the ambient is how the process is bounded in time.',
    ['What is the wafer doing while it sits hot in air?', 'What property must the purge gas have?']),

  item('ee4392.oxidation-mechanism', 0.1,
    'Heavily doped silicon oxidises faster than lightly doped silicon, and the effect is strongest for thin oxides. Why?',
    [
      o('a', 'Heavy doping raises the vacancy concentration near the surface, and consuming a vacancy site is easier than breaking an intact Si–Si bond — which speeds the interface reaction'),
      o('b', 'Dopant atoms dissolve into the oxide and raise the oxidant diffusivity through it', 'oxidation.doping-blamed-on-diffusivity'),
      o('c', 'Heavy doping lowers the melting point, so the lattice is more reactive', 'oxidation.doping-blamed-on-melting'),
      o('d', 'Dopants react directly with oxygen to form their own oxides', 'oxidation.doping-blamed-on-dopant-oxide'),
    ], 'a',
    [
      'The interface reaction has to break silicon out of the lattice, and a site that is already a vacancy costs nothing to break.',
      'Heavy doping — especially $n^{+}$ — raises the equilibrium vacancy concentration, so more such sites are available.',
      'That accelerates $k_s$ and therefore $B/A$, the linear constant.',
      'Because $B/A$ dominates only while the oxide is thin, the effect is pronounced in the linear regime and fades once growth becomes diffusion-limited.',
    ],
    'An effect on one rate constant only shows up in the regime that constant controls. Knowing which regime is affected is half of knowing the mechanism.',
    ['Which rate constant describes the surface reaction?', 'In which thickness regime does that constant dominate?']),

  item('ee4392.oxide-metrology', -0.2,
    'Ellipsometry and reflectometry both measure oxide thickness. What does ellipsometry provide that reflectometry does not?',
    [
      o('a', 'The optical constants of the film as well as its thickness, because it measures the polarisation change on reflection'),
      o('b', 'A thickness measurement that does not require the film to be transparent', 'metrology.ellipsometry-blamed-on-opacity'),
      o('c', 'Measurement without contacting the wafer', 'metrology.ellipsometry-blamed-on-contact'),
      o('d', 'Better lateral resolution across the wafer', 'metrology.ellipsometry-blamed-on-resolution'),
    ], 'a',
    [
      'Reflectometry measures reflected intensity against wavelength and fits a thickness to the interference pattern.',
      'Ellipsometry measures how the polarisation state changes on reflection, which carries two independent quantities rather than one.',
      'That lets it solve for the refractive index $n$ and extinction coefficient $k$ alongside the thickness.',
      'Both are non-contact and optical; the difference is how many unknowns the measurement can support.',
    ],
    'What a measurement can determine is bounded by how many independent quantities it records.',
    ['How many numbers does each technique actually measure?', 'What else besides thickness sets a film\'s reflectance?']),

  item('ee4392.oxidation-mechanism', 0.2,
    'What is the purpose of adding a chlorine-bearing species such as HCl to the oxygen flow during thermal oxidation?',
    [
      o('a', 'To convert mobile alkali ions into volatile chlorides that leave with the exhaust, gettering them during growth'),
      o('b', 'To increase the oxidation rate by raising the oxidant concentration', 'oxidation.hcl-blamed-on-rate'),
      o('c', 'To etch back the oxide continuously and improve thickness uniformity', 'oxidation.hcl-blamed-on-etch'),
      o('d', 'To passivate dangling bonds at the silicon surface', 'oxidation.hcl-blamed-on-passivation'),
    ], 'a',
    [
      'Sodium and potassium are the classic mobile charges in $\\mathrm{SiO_2}$: they drift under gate bias and shift threshold voltage over time.',
      'Chlorine present during growth binds them as volatile chlorides, which are carried away rather than incorporated.',
      'This is gettering performed in situ, during the oxidation, rather than as a separate step.',
      'It does modestly increase the growth rate as a side effect, but that is not why it is done.',
    ],
    'Contamination control is not only a separate cleaning step; some process steps are arranged to reject contaminants while they run.',
    ['Which impurities move under bias in an oxide?', 'What would make such an impurity leave the furnace?']),

  item('ee4392.oxidation-mechanism', 0.4,
    'Gate dielectrics moved to high-$k$ materials once oxide thicknesses approached one nanometre. What problem forced the change?',
    [
      o('a', 'Direct quantum-mechanical tunnelling through the gate dielectric, which rises steeply as the film thins'),
      o('b', 'The oxide could no longer be grown uniformly at those thicknesses', 'highk.blamed-on-uniformity'),
      o('c', 'The dielectric constant of $\\mathrm{SiO_2}$ falls at very small thicknesses', 'highk.blamed-on-permittivity-change'),
      o('d', 'Dopant atoms began to diffuse through the oxide into the channel', 'highk.blamed-on-dopant-diffusion'),
    ], 'a',
    [
      'Scaling demands more gate capacitance per unit area, which for a fixed material means a thinner film.',
      'Below roughly one to two nanometres, carriers tunnel directly through the dielectric and gate leakage becomes a significant share of total power.',
      'A higher-permittivity material reaches the same capacitance with a physically thicker film, and tunnelling depends on physical thickness.',
      'The film is then quoted as an equivalent oxide thickness: a 4 nm high-$k$ layer can present an EOT near 1 nm while leaking far less.',
    ],
    'Equivalent oxide thickness separates the electrical requirement from the physical one. High-k exists to let those two diverge.',
    ['What happens to a barrier as it gets thin?', 'Does tunnelling care about electrical or physical thickness?']),

  // ---- Cleanroom, defects and yield ------------------------------------
  item('ee4392.contamination-control', -0.4,
    'Airborne particles between roughly 10 nm and 10 µm are the hardest to remove from fab air. Why are particles outside that band easier?',
    [
      o('a', 'Smaller particles coagulate into larger ones that filter readily, and larger particles settle out under gravity before reaching a wafer'),
      o('b', 'Particles outside that band are electrically neutral and are captured by ionisers', 'cleanroom.band-blamed-on-charge'),
      o('c', 'HEPA filters are designed to pass that band and trap everything else', 'cleanroom.band-blamed-on-filter-design'),
      o('d', 'Only particles in that band are generated inside the fab', 'cleanroom.band-blamed-on-source'),
    ], 'a',
    [
      'Very small particles undergo strong Brownian motion, collide often and stick together, so they quickly become larger particles that filters capture.',
      'Very large particles have enough mass that gravitational settling removes them from the air on a short timescale.',
      'The intermediate band does neither efficiently: too large to coagulate quickly, too small to settle quickly.',
      'So it stays suspended and airborne, which is exactly the population that can drift down onto a wafer.',
    ],
    'Removal mechanisms have opposite size dependences, so the hardest case is always somewhere in the middle.',
    ['What happens to very small particles over time?', 'What removes large particles without any equipment?']),

  item('ee4392.wafer-cleaning', 0.1,
    'The RCA sequence uses several different chemistries rather than one bath. What makes the sequence necessary?',
    [
      o('a', 'No single chemistry removes organics, native oxide, transition metals and alkali ions, so each step targets a different contaminant class'),
      o('b', 'Repeated exposure to one chemistry would etch the silicon too deeply', 'rca.sequence-blamed-on-etch-depth'),
      o('c', 'Mixing the chemistries in one bath would be explosive', 'rca.sequence-blamed-on-safety'),
      o('d', 'Each step has to run at a different temperature, which one bath cannot provide', 'rca.sequence-blamed-on-temperature'),
    ], 'a',
    [
      'Organic residues need a strong oxidiser to break them up, which is what the sulphuric-peroxide step supplies.',
      'Native and chemical oxide needs dilute HF, which nothing else strips selectively.',
      'Particles and the noble and transition metals come off in the ammonia-peroxide step; alkali ions and the remaining metals need the acidic hydrochloric-peroxide step.',
      'The classes are chemically unlike each other, so the sequence is a sequence by necessity rather than by tradition.',
    ],
    'A clean is defined by what it has to remove. Four unlike contaminant classes require four unlike chemistries.',
    ['Name the contaminant classes present on an incoming wafer.', 'Would an acid that strips oxide also break up an organic film?']),

  item('ee4392.wafer-cleaning', 0.3,
    'For a metallic contaminant to be rinsed off a wafer, what has to happen to it first, and why?',
    [
      o('a', 'It must be oxidised to an ion, because only a soluble ionic species will dissolve into the bath and leave with the rinse'),
      o('b', 'It must be reduced to its metallic state so it no longer bonds to silicon', 'rca.metal-removal-inverted'),
      o('c', 'It must be driven into the bulk where the rinse can reach it', 'rca.metal-removal-blamed-on-diffusion'),
      o('d', 'It must be covered by oxide so it lifts off when the oxide is stripped', 'rca.metal-removal-blamed-on-liftoff'),
    ], 'a',
    [
      'A neutral metal atom on the surface is not soluble in water and will simply stay there, or re-plate if it does leave.',
      'Oxidising it, $M \\rightarrow M^{+} + e^{-}$, produces a charged species that water solvates.',
      'Whether a given bath can do this is set by the relative oxidation-reduction potentials: the bath has to be the stronger oxidiser.',
      'Hydrogen peroxide is what supplies that oxidising power in both RCA steps; a plain water rinse would let iron plate back onto the surface instead.',
    ],
    'Cleaning is a solubility problem before it is a rinsing problem. The chemistry exists to make the contaminant soluble.',
    ['Is a metal atom soluble in water?', 'What does the peroxide contribute that water does not?']),

  item('ee4392.gettering', 0.15,
    'Gettering is described as free, diffuse and trap. Why must the freeing step come first?',
    [
      o('a', 'A metal sitting substitutionally in the lattice is effectively immobile; it must be kicked into an interstitial site before it can diffuse anywhere'),
      o('b', 'The trap sites do not exist until a high-temperature step creates them', 'gettering.free-blamed-on-trap-creation'),
      o('c', 'The metal must be oxidised before it will move', 'gettering.free-blamed-on-oxidation'),
      o('d', 'Freeing lowers the metal concentration enough for diffusion to begin', 'gettering.free-blamed-on-concentration'),
    ], 'a',
    [
      'Gettering works by moving contaminants from where devices are to somewhere harmless, which requires them to move at all.',
      'Substitutional metals are bound into lattice sites and diffuse extremely slowly.',
      'A high-temperature step promotes them into interstitial sites, where metals diffuse quickly.',
      'Only then can the second step — diffusion toward the gettering sites — happen on a practical timescale, with trapping as the third.',
    ],
    'Each step in a three-step mechanism enables the next. The ordering is the mechanism, not a convention.',
    ['How fast does a substitutional metal diffuse?', 'What has to be true before a diffusion step can work?']),

  item('ee4392.gettering', 0.4,
    'Gettering fails when the contamination level is too high. What breaks down?',
    [
      o('a', 'The available trap sites saturate, and once they are full there is nothing to hold further contaminant'),
      o('b', 'High contamination lowers the diffusivity so contaminants cannot reach the traps', 'gettering.saturation-blamed-on-diffusivity'),
      o('c', 'Excess contaminant reacts with the getter layer and destroys it', 'gettering.saturation-blamed-on-getter-destruction'),
      o('d', 'The denuded zone collapses at high contamination levels', 'gettering.saturation-blamed-on-denuded-zone'),
    ], 'a',
    [
      'Gettering sites are a finite population of damaged regions, precipitates or heavily doped volumes.',
      'Each one can immobilise a limited amount of contaminant.',
      'Once they are occupied, further contaminant has nowhere to go and remains in the active region regardless of how long the anneal runs.',
      'Gettering is therefore a finishing technique for a clean process, not a substitute for one.',
    ],
    'A sink with finite capacity only helps while it has capacity. Contamination control is upstream of gettering, not replaced by it.',
    ['What physically holds the contaminant at a gettering site?', 'Is that capacity unlimited?']),

  item('ee4392.gettering', 0.3,
    'What distinguishes intrinsic gettering from extrinsic gettering?',
    [
      o('a', 'Intrinsic gettering uses oxygen precipitates nucleated in the wafer bulk; extrinsic gettering uses damage or layers deliberately introduced, usually at the backside'),
      o('b', 'Intrinsic gettering happens during crystal growth; extrinsic gettering happens during device processing', 'gettering.intrinsic-blamed-on-timing'),
      o('c', 'Intrinsic gettering traps alkali ions; extrinsic gettering traps transition metals', 'gettering.intrinsic-blamed-on-species'),
      o('d', 'Intrinsic gettering is permanent; extrinsic gettering reverses on cooling', 'gettering.intrinsic-blamed-on-reversibility'),
    ], 'a',
    [
      'Czochralski silicon carries dissolved oxygen picked up from the quartz crucible during the pull.',
      'A nucleation and growth anneal precipitates that oxygen deep in the bulk, and the strain around the precipitates traps metals — the traps come from the wafer itself, hence intrinsic.',
      'A denuded zone is left near the surface, cleared of precipitates, so devices sit in good material while the traps sit safely below them.',
      'Extrinsic gettering instead adds something: backside implant damage, abrasion, a polysilicon layer, or a phosphorus-rich glass.',
    ],
    'The distinction is where the trap sites come from, not what they catch.',
    ['Where does the oxygen in a CZ wafer come from?', 'What is a denuded zone for?']),

  item('ee4392.killer-defects', -0.2,
    'A particle that was harmless at an older technology node can be a killer defect at a newer one, without changing size. Why?',
    [
      o('a', 'Killer size is relative to the minimum feature: as features shrink, a fixed particle becomes large enough to bridge or open a structure'),
      o('b', 'Newer nodes use thinner films, which particles penetrate more easily', 'defects.killer-blamed-on-film-thickness'),
      o('c', 'Newer processes run at lower temperatures, so particles are not annealed out', 'defects.killer-blamed-on-thermal-budget'),
      o('d', 'Particle composition changes as processes change', 'defects.killer-blamed-on-composition'),
    ], 'a',
    [
      'A defect kills a die only if it actually breaks a circuit — shorting two conductors, or opening one.',
      'Whether a given particle can do that depends on its size compared with the line width and spacing around it.',
      'Shrinking the node shrinks that comparison length, so the critical defect size falls with it.',
      'The particle population has not changed; the threshold moved, which is why particle targets keep tightening indefinitely.',
    ],
    'Defectivity requirements are set by a ratio, not an absolute size. That is why the target never stops moving.',
    ['What makes a defect a killer rather than a nuisance?', 'Which quantity in that comparison changed?']),

  item('ee4392.yield-models', 0.25,
    'The Poisson yield model tends to underpredict the yield of large die. What assumption causes that?',
    [
      o('a', 'It assumes defects are spatially uncorrelated, whereas real defects cluster — leaving more entirely defect-free die than the model expects'),
      o('b', 'It assumes every defect is a killer defect', 'yield.poisson-blamed-on-killer-assumption'),
      o('c', 'It ignores parametric failures, which dominate for large die', 'yield.poisson-blamed-on-parametric'),
      o('d', 'It assumes defect density is independent of die area', 'yield.poisson-blamed-on-density'),
    ], 'a',
    [
      'Poisson treats each defect as landing independently and uniformly across the wafer.',
      'Real defects arrive in clusters — a tool excursion, a handling scratch, an edge effect — so they concentrate on some die and spare others.',
      'Clustering means more die escape entirely than independence would predict, so true yield exceeds the Poisson figure.',
      'The negative binomial model adds a clustering factor $C$ to capture this, and recovers Poisson only in the limit of no clustering at all.',
    ],
    'A yield model is a statement about the spatial statistics of defects. Getting the statistics wrong biases the answer in a predictable direction.',
    ['Do defects arrive independently in a real fab?', 'Does clustering help or hurt the number of clean die?']),

  item('ee4392.yield-models', 0.5,
    'In the negative binomial model $Y = (1 + A_c D_0/C)^{-C}$, what happens as the clustering factor $C$ becomes very large?',
    [
      o('a', 'The model approaches the Poisson result, because large $C$ means little clustering'),
      o('b', 'The model approaches the Poisson result, because $C$ tending to zero is the uncorrelated case', 'yield.poisson-limit-at-zero'),
      o('c', 'Yield approaches one regardless of defect density', 'yield.large-c-limit-unity'),
      o('d', 'Yield approaches the Seeds model', 'yield.large-c-limit-seeds'),
    ], 'a',
    [
      'Small $C$ means heavy clustering; the Seeds model is the $C = 1$ case and predicts the highest yield of the three.',
      'As $C$ grows, clustering weakens and the predicted yield falls toward the uncorrelated case.',
      'Taking the limit, $(1 + A_c D_0/C)^{-C} \\to e^{-A_c D_0}$ as $C \\to \\infty$, which is exactly Poisson.',
      'Setting $C = 0$ instead gives an indeterminate form and no limit at all, so the Poisson case is the large-$C$ end and not the small-$C$ end.',
    ],
    'The clustering factor runs from heavily clustered at small C to uncorrelated at large C, and Poisson sits at the uncorrelated end.',
    ['Which end of the C range means no clustering?', 'Which model predicts the lowest yield at a given area?']),

  item('ee4392.process-capability', 0.2,
    'A process shows $C_p = 1.94$ but $C_{pk} = 1.60$. What does the gap between them say?',
    [
      o('a', 'The spread is tight enough for the specification, but the mean is off centre — recentring would raise $C_{pk}$ without reducing variation at all'),
      o('b', 'The distribution is not Gaussian, so the indices disagree', 'capability.gap-blamed-on-distribution'),
      o('c', 'The variation is too large and must be reduced before the process can be capable', 'capability.gap-blamed-on-spread'),
      o('d', 'Measurement error is inflating one of the two indices', 'capability.gap-blamed-on-metrology'),
    ], 'a',
    [
      '$C_p$ compares the full specification width against $6\\sigma$ and says nothing about where the distribution sits.',
      '$C_{pk}$ measures the distance from the mean to the nearer specification limit in units of $3\\sigma$, so it falls when the mean drifts off target.',
      'The two are equal only when the mean sits exactly at the midpoint of the specification.',
      'A high $C_p$ with a lower $C_{pk}$ therefore diagnoses a centring problem, which is usually cheaper to fix than a variation problem.',
    ],
    'Two indices that differ only in whether they notice the mean turn a single number into a diagnosis.',
    ['Which index notices where the mean sits?', 'What would make the two indices equal?']),

  item('ee4392.killer-defects', -0.1,
    'A voltage regulator comes off the line functional but delivers 2.9 V where the specification demands 3.3 V. How is this classified?',
    [
      o('a', 'A parametric failure — the die works but falls outside its specified window'),
      o('b', 'A functional failure, since the part does not meet its specification', 'defects.parametric-called-functional'),
      o('c', 'A killer defect, since the die cannot be sold', 'defects.parametric-called-killer'),
      o('d', 'A yield loss that no model accounts for', 'defects.parametric-called-unmodelled'),
    ], 'a',
    [
      'A functional failure means the circuit does not do its job at all — a stuck node, a short, an open.',
      'This part performs its function; it simply performs it outside the allowed range.',
      'That is a parametric failure, and it traces to manufacturing variation, design margin, or both rather than to a particle.',
      'It is exactly the loss mechanism $C_p$ and $C_{pk}$ are monitored to control, which is why process capability sits in the same unit as defect density.',
    ],
    'Yield loss splits into die that cannot work and die that work wrongly. The two have different causes and different remedies.',
    ['Does the part perform its intended function?', 'Which yield mechanism does process capability address?']),

  // ---- Lithography -----------------------------------------------------
  item('ee4392.resist-chemistry', -0.6,
    'What distinguishes a positive photoresist from a negative one?',
    [
      o('a', 'In a positive resist exposure weakens the polymer and the developer removes the exposed regions; in a negative resist exposure cross-links it and the developer removes the unexposed regions'),
      o('b', 'A positive resist is used for etch masks and a negative resist for implant masks', 'resist.polarity-blamed-on-application'),
      o('c', 'A positive resist requires a post-exposure bake and a negative one does not', 'resist.polarity-blamed-on-peb'),
      o('d', 'A positive resist responds to shorter wavelengths than a negative resist', 'resist.polarity-blamed-on-wavelength'),
    ], 'a',
    [
      'Both resists change solubility on exposure; they differ in which direction.',
      'A positive resist becomes more soluble where light landed, so the developed pattern reproduces the clear areas of the mask.',
      'A negative resist cross-links where light landed and becomes less soluble, so the developed pattern is the mask\'s complement.',
      'Reading a contrast curve tells you which you have: if resist remains at low dose and clears at high dose the resist is positive, and the reverse for negative.',
    ],
    'Polarity is about which regions survive development, which is what decides whether the printed image matches the mask or inverts it.',
    ['Which regions does the developer remove in each case?', 'How would a contrast curve differ between the two?']),

  item('ee4392.resist-chemistry', 0.35,
    'At which step of the lithography module does the catalytic amplification in a chemically amplified DUV resist actually occur?',
    [
      o('a', 'The post-exposure bake — exposure only generates the initial acid, and heat drives the catalytic cascade'),
      o('b', 'The exposure step itself, since that is where the photons arrive', 'resist.pag-activated-at-exposure'),
      o('c', 'The develop step, when the developer reaches the acid', 'resist.pag-activated-at-develop'),
      o('d', 'The soft bake, which prepares the acid generator', 'resist.pag-activated-at-softbake'),
    ], 'a',
    [
      'A photo-acid generator converts absorbed photons into a small quantity of acid during exposure.',
      'That acid is a catalyst: it deprotects resin sites and is regenerated, so one acid molecule can alter many sites.',
      'The cascade needs thermal energy to proceed, which is supplied by the post-exposure bake.',
      'This is why chemically amplified resists reach quantum efficiencies above one, and why PEB timing and temperature are tightly controlled — it is a real reaction step, not a drying step.',
    ],
    'In a chemically amplified resist, exposure and chemical change happen at different steps. That separation is what buys the sensitivity.',
    ['What does the exposure actually produce in a PAG resist?', 'What does a catalytic cascade need to run?']),

  item('ee4392.resist-chemistry', -0.5,
    'How is the thickness of a spun-on photoresist film primarily controlled?',
    [
      o('a', 'By spin speed, together with the viscosity and solids content of the resist'),
      o('b', 'By the volume of resist dispensed onto the wafer', 'resist.thickness-blamed-on-volume'),
      o('c', 'By the soft-bake temperature', 'resist.thickness-blamed-on-bake'),
      o('d', 'By the duration of the dispense step', 'resist.thickness-blamed-on-dispense-time'),
    ], 'a',
    [
      'Spin coating reaches a steady state in which centrifugal thinning balances viscous resistance and solvent evaporation.',
      'That equilibrium sets the final thickness, and it depends on angular velocity and on the fluid itself.',
      'Thickness falls roughly as the inverse square root of spin speed, so faster spinning gives a thinner film.',
      'Dispense volume barely matters provided the wafer is fully wetted — the excess is flung off before the film sets.',
    ],
    'Spin coating is self-limiting: the film thins until the physics balances, so the endpoint depends on the spin and the fluid rather than on how much was poured.',
    ['What balances what during a spin?', 'Does pouring twice as much resist give twice the thickness?']),

  item('ee4392.litho-systems', 0.1,
    'Why do EUV lithography systems image with mirrors rather than lenses?',
    [
      o('a', 'No material is transparent at 13.5 nm, so refractive optics are impossible and multilayer reflective optics are used instead'),
      o('b', 'Mirrors can be made larger than lenses, giving a higher numerical aperture', 'euv.mirrors-blamed-on-size'),
      o('c', 'Lenses would introduce chromatic aberration at EUV wavelengths', 'euv.mirrors-blamed-on-chromatic'),
      o('d', 'Mirrors tolerate the heat load from the plasma source better', 'euv.mirrors-blamed-on-heat'),
    ], 'a',
    [
      'At 13.5 nm every material absorbs strongly, including the glasses used for DUV optics.',
      'A lens requires light to pass through it, so refractive optics simply cannot be built at this wavelength.',
      'Reflection is still possible using multilayer Bragg mirrors tuned to the wavelength, though each reflects only around 70%.',
      'Because losses compound across a mirror stack, the whole system — including the mask, which is also reflective — has to work in vacuum with very few optical elements.',
    ],
    'The optics available at a wavelength are set by what materials do at that wavelength, and that constraint shapes the entire tool.',
    ['What must be true of a material for a lens to work?', 'Is there any transparent material at 13.5 nm?']),

  item('ee4392.resolution-enhancement', 0.45,
    'Immersion lithography puts water between the final lens element and the wafer. What does it actually achieve?',
    [
      o('a', 'It removes the refractive-index limit that capped practical numerical aperture in air, allowing NA above 1'),
      o('b', 'It shortens the effective wavelength enough to skip a technology generation on its own', 'immersion.blamed-on-wavelength-alone'),
      o('c', 'It cools the resist, reducing line-edge roughness', 'immersion.blamed-on-cooling'),
      o('d', 'It increases the transmitted intensity, shortening exposure time', 'immersion.blamed-on-intensity'),
    ], 'a',
    [
      'Numerical aperture is $n\\sin\\theta$, and in air $n = 1$ bounds NA below one however good the lens.',
      'The practical bound is tighter still, because rays beyond the critical angle at the lens-to-air interface are totally internally reflected and never reach the wafer.',
      'Water at $n = 1.44$ is much closer to the lens glass at $n \\approx 1.5$, so that interface stops rejecting high-angle rays.',
      'That is what lets 193 nm immersion tools run at NA near 1.35, improving both resolution and — for a given feature — depth of focus.',
    ],
    'Immersion does not change the lens or the light. It changes the medium, and with it the largest angle the system can actually collect.',
    ['What bounds NA when the medium is air?', 'What happens to rays beyond the critical angle?']),

  item('ee4392.resolution-enhancement', 0.4,
    'How does a phase-shift mask allow smaller features to be printed?',
    [
      o('a', 'Adjacent apertures are made to transmit light 180° out of phase, so the fields cancel between them and the intensity minimum becomes sharp'),
      o('b', 'It blocks the zeroth diffraction order, leaving only the higher orders to form the image', 'psm.blamed-on-zeroth-order-block'),
      o('c', 'It shifts the focal plane to compensate for wafer non-flatness', 'psm.blamed-on-focus'),
      o('d', 'It polarises the illumination so the resist absorbs more efficiently', 'psm.blamed-on-polarisation'),
    ], 'a',
    [
      'Diffraction spreads light from neighbouring apertures until their intensities overlap and the gap between features washes out.',
      'A phase shifter in alternate apertures inverts the sign of the electric field emerging from them.',
      'Where the two fields overlap they now cancel rather than add, and since resist responds to intensity — the square of the field — a true null appears between the features.',
      'A sharper minimum means the printed features stay separate at pitches that would otherwise merge.',
    ],
    'The resist sees intensity, but the optics carry amplitude and phase. Controlling phase at the mask is a lever the intensity image alone does not offer.',
    ['What does resist respond to — field or intensity?', 'What do two fields of opposite sign do where they overlap?']),

  item('ee4392.litho-systems', -0.3,
    'What is the essential trade-off between contact and proximity printing?',
    [
      o('a', 'Contact printing resolves finer features but damages the mask and generates defects; proximity printing spares the mask at the cost of resolution'),
      o('b', 'Contact printing is faster but needs a brighter source', 'shadow.tradeoff-blamed-on-throughput'),
      o('c', 'Proximity printing resolves better because the gap reduces diffraction', 'shadow.tradeoff-inverted'),
      o('d', 'Contact printing works only with negative resist', 'shadow.tradeoff-blamed-on-resist'),
    ], 'a',
    [
      'In shadow printing the resolvable feature scales roughly as $\\sqrt{k\\lambda g}$, so closing the gap $g$ improves resolution.',
      'Hard contact drives $g$ toward zero and approaches the best resolution these systems can reach.',
      'But repeatedly pressing a mask against resist-coated wafers scratches the mask and transfers particles, and a damaged mask prints its damage onto every subsequent wafer.',
      'Proximity printing accepts a finite gap to protect the mask, and pays for it in resolution — which is why both were displaced by projection printing.',
    ],
    'Resolution and mask lifetime pull against each other in shadow printing, and projection optics exist to escape the choice entirely.',
    ['What does the gap do to resolution?', 'What is the cost of a mask touching every wafer?']),

  item('ee4392.resist-contrast', 0.3,
    'MTF and CMTF are compared to decide whether a feature will print. Which is which?',
    [
      o('a', 'MTF is the modulation of the optical image; CMTF is the modulation the resist needs, and the feature prints when MTF exceeds CMTF'),
      o('b', 'MTF is a resist property and CMTF an optical one; the feature prints when CMTF exceeds MTF', 'litho.mtf-cmtf-swapped'),
      o('c', 'Both are optical, measured before and after the resist stack', 'litho.mtf-cmtf-both-optical'),
      o('d', 'Both are resist properties, measured at two different doses', 'litho.mtf-cmtf-both-resist'),
    ], 'a',
    [
      'The optical MTF is computed from the aerial image: $(I_{\\max} - I_{\\min})/(I_{\\max} + I_{\\min})$, a property of the projection system.',
      'The resist CMTF is computed from the two dose limits: $(Q_f - Q_0)/(Q_f + Q_0)$, a property of the chemistry.',
      'The resist can only distinguish exposed from unexposed if the image it receives is modulated by at least as much as it requires.',
      'So the criterion is $\\mathrm{MTF} > \\mathrm{CMTF}$ — supply exceeding demand — and a high-contrast resist lowers the demand.',
    ],
    'One number describes what the optics deliver and one describes what the chemistry needs. The comparison is the whole resolution criterion.',
    ['Which quantity is computed from intensities and which from doses?', 'Which side is supply and which is demand?']),

  item('ee4392.resist-contrast', 0.15,
    'A resist has a high contrast $\\gamma$. What does that tell you about it?',
    [
      o('a', 'It switches from unexposed to fully exposed over a narrow range of dose, so it discriminates sharply at the feature edge'),
      o('b', 'It needs a high absolute dose to clear, so exposure times are long', 'resist.contrast-confused-with-sensitivity'),
      o('c', 'It tolerates a wide range of doses before responding at all', 'resist.contrast-inverted'),
      o('d', 'It has a high refractive index at the exposure wavelength', 'resist.contrast-confused-with-index'),
    ], 'a',
    [
      'Contrast is $\\gamma = 1/\\log_{10}(Q_f/Q_0)$, so it is large when $Q_f$ and $Q_0$ are close together.',
      'A narrow gap between "just starting to respond" and "fully cleared" means a small change in dose flips the resist.',
      'At a feature edge the dose falls off gradually, and a sharp switch converts that gradual roll-off into a steep resist sidewall.',
      'Contrast is independent of sensitivity: it is about the width of the transition, not where it sits on the dose axis.',
    ],
    'Contrast and sensitivity are separate axes. One is how sharply the resist switches; the other is how much light it takes.',
    ['Does a high gamma mean Qf and Q0 are close together or far apart?', 'Is contrast about the position of the transition or its width?']),

  item('ee4392.optical-resolution', 0.05,
    'Raising the numerical aperture of a projection system improves resolution. What does it cost?',
    [
      o('a', 'Depth of focus, which falls as $1/\\mathrm{NA}^2$ and so degrades faster than resolution improves'),
      o('b', 'Exposure dose, which must rise in proportion to NA', 'litho.na-cost-blamed-on-dose'),
      o('c', 'Field size, which shrinks in proportion to NA', 'litho.na-cost-blamed-on-field'),
      o('d', 'Nothing — a higher NA is strictly better', 'litho.na-assumed-free'),
    ], 'a',
    [
      'Resolution improves linearly: $R = k_1\\lambda/\\mathrm{NA}$.',
      'Depth of focus degrades quadratically: $\\mathrm{DOF} = \\pm k_2\\lambda/\\mathrm{NA}^2$.',
      'Doubling NA therefore halves the printable feature but quarters the usable focal range.',
      'Since real depth of focus is already well under a micrometre, it is usually the binding constraint — which is why wafer flatness, resist thickness and focus control are lithography problems rather than afterthoughts.',
    ],
    'The two figures of merit share a parameter and move oppositely in it. That is the central trade of projection lithography.',
    ['What power of NA appears in each expression?', 'Which of the two is usually the binding constraint?']),

  item('ee4392.resist-chemistry', 0.5,
    'Why do resists for shorter exposure wavelengths need higher contrast than i-line resists did?',
    [
      o('a', 'Smaller features have inherently lower optical image contrast, so the resist must supply more of the discrimination itself'),
      o('b', 'Shorter wavelengths deposit less energy per photon, so the chemistry must compensate', 'resist.contrast-blamed-on-photon-energy'),
      o('c', 'Shorter wavelengths penetrate further into the resist, blurring the latent image', 'resist.contrast-blamed-on-penetration'),
      o('d', 'Shorter-wavelength sources are less stable, so the resist must tolerate dose variation', 'resist.contrast-blamed-on-source-stability'),
    ], 'a',
    [
      'As features approach the resolution limit, the aerial image degrades: $I_{\\max}$ falls and $I_{\\min}$ rises, so the optical MTF drops.',
      'The resolution criterion $\\mathrm{MTF} > \\mathrm{CMTF}$ still has to be satisfied.',
      'With less MTF available from the optics, the only way to keep the inequality is to lower CMTF, which means raising resist contrast.',
      'That is why contrast climbed from around 2–3 for i-line resists to 5–10 for DUV, and higher again for EUV.',
    ],
    'When the optics give less contrast, the chemistry must demand less. The resolution criterion is a budget shared between them.',
    ['What happens to the aerial image as features approach the limit?', 'Which side of the inequality can chemistry change?']),
];

const pack = {
  schemaVersion: '1.0.0',
  packId: 'ee4392-concepts-v1',
  version: 1,
  course: 'EE4392',
  title: 'Microelectronics manufacturing concepts',
  provenance: {
    producer: 'hand',
    sourceRef: 'ee4392-concepts',
    licenseTier: 'redistributable',
    createdAt: '1970-01-01T00:00:00.000Z',
  },
  items,
};
writeFileSync('content/inbox/ee4392-concepts-v1.json', `${JSON.stringify(pack, null, 2)}\n`);
console.log('wrote', items.length, 'items');
