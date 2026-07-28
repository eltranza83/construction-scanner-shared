/**
 * Service to manage City Inspection Pre-Check checklists across the 6 municipal build stages.
 */

export const INSPECTION_STAGES = [
  {
    id: 'rough-in-plumbing',
    number: 1,
    name: 'Rough-In Plumbing',
    shortName: 'Plumbing',
    icon: '🚰',
    description: 'Underground plumbing, setback lines, water head test, and site setup compliance.'
  },
  {
    id: 'foundation',
    number: 2,
    name: 'Foundation',
    shortName: 'Foundation',
    icon: '🏗️',
    description: 'Grading, formwork setbacks, rebar steel grid, ufer ground, and vapor barrier pre-pour.'
  },
  {
    id: 'framing',
    number: 3,
    name: 'Framing (Elec / Mech / Plumb / Poly Seal)',
    shortName: 'Framing Combo',
    icon: '🪵',
    description: 'Structural framing, shear wall, rough electrical, rough HVAC, rough plumbing top-out, and poly seal air sealing.'
  },
  {
    id: 'insulation',
    number: 4,
    name: 'Insulation',
    shortName: 'Insulation',
    icon: '🧱',
    description: 'Batten/spray foam insulation, fireblocking, air-sealing, and draft stops.'
  },
  {
    id: 'infiltration',
    number: 5,
    name: 'Infiltration',
    shortName: 'Infiltration',
    icon: '💨',
    description: 'Blower door building envelope leakage, duct tightness testing, and air sealing.'
  },
  {
    id: 'final',
    number: 6,
    name: 'Final Inspection (C.O.)',
    shortName: 'Final (C.O.)',
    icon: '🔑',
    description: 'Final plumbing, electrical, HVAC, safety devices, and Certificate of Occupancy.'
  }
];

export const INITIAL_PLUMBING_ITEMS = [
  {
    id: 'item-water-meter',
    title: 'City Water Meter Set & Installed',
    category: 'Site Setup & Utilities',
    description: 'City utility water meter requested, set, and active prior to temp plumbing connections.',
    status: 'pending', // 'pending' | 'passed' | 'fix_required'
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-vacuum-breaker',
    title: 'Temporary Hose Faucet with Vacuum Breaker (Backflow Preventer)',
    category: 'Site Setup & Utilities',
    description: 'Temp hose bibb installed off water meter line with anti-siphon vacuum breaker device to prevent back-siphonage into city water supply.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-permit-board',
    title: 'Lot Number & City Building Permit Board Posted On-Site',
    category: 'Site Setup & Compliance',
    description: 'Plywood / OSB permit board erected at front of lot with huge visible Lot Number and city building permit stapled in clear weatherproof pouch.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-erosion-control',
    title: 'Erosion Control Barrier / Silt Fencing',
    category: 'Site Setup & Compliance',
    description: 'Erosion control barrier / silt fencing installed along lot boundaries to prevent dirt runoff.',
    status: 'pending',
    photoUrl: null,
    note: 'Check with city inspector if the 4ft or 5ft lot perimeter fence installed around the lot satisfies the silt fencing requirement.'
  },
  {
    id: 'item-port-a-potty',
    title: 'Port-A-Potty / Temporary Toilet Delivered On-Site',
    category: 'Site Setup & Compliance',
    description: 'Temporary toilet facility delivered and visible at front of lot prior to scheduling inspector arrival.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-setback-lines',
    title: 'String / Yarn Setback Lines Strung Across Forms',
    category: 'Layout & Setbacks',
    description: 'String/yarn lines strung across form boards for city inspector to verify property line setbacks and building footprint limits.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-drain-slopes',
    title: 'Drain & Waste Pipe Trenching, Bedding & Slopes',
    category: 'Underground Plumbing',
    description: 'Underground sewer lines trenched with 1/4" per ft slope, sand bedding, and cleanouts installed at required locations.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-water-stack-test',
    title: 'Water Head / Stack Pressure Test (8-9ft Stack)',
    category: 'Underground Plumbing',
    description: 'Vertical 8-9ft stack pipe filled with water via hose to pressurize all underground drain lines and test for 100% leak-free pipes before backfilling.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-pipe-sleeves',
    title: 'Pipe Sleeve Protectors Under Forms & Footings',
    category: 'Underground Plumbing',
    description: 'Supply and drain lines properly sleeved where passing underneath form boards or future concrete footings.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-post-inspection-backfill',
    title: 'Post-Inspection Pipe Capping & Trench Backfill',
    category: 'Underground Plumbing',
    description: 'Once inspection is passed, plumber must cap/seal all open pipe ends and backfill trenches with sand/dirt to protect pipes before slab prep.',
    status: 'pending',
    photoUrl: null,
    note: 'Ensure caps are glued/tight so dirt or concrete does not fall into open lines.'
  }
];

export const INITIAL_FOUNDATION_ITEMS = [
  {
    id: 'item-foundation-pad-forms',
    title: 'Pad Dirt Leveling, Formwork & Trench Squareness',
    category: 'Pad & Formwork',
    description: 'Pad dirt scraped and leveled, form boards staked securely, and neat square trenches dug with clean diagonals.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-foundation-undisturbed-soil',
    title: '12-Inch Minimum Undisturbed Soil Depth for Stirrups',
    category: 'Soil & Excavation',
    description: 'Trenches dug down to at least 12 inches into undisturbed soil (verified by natural soil layer color change) for stirrups & grade beams.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-foundation-termite-treatment',
    title: 'Early-Morning Termite Soil Pre-Treatment',
    category: 'Environmental Protection',
    description: 'Chemical soil treatment sprayed early in the morning directly across all dirt trenches before plastic barrier is laid.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-foundation-vapor-barrier',
    title: 'Vapor Barrier Sheeting & 100% Seam Taping',
    category: 'Moisture Protection',
    description: 'Plastic vapor barrier laid immediately over treated soil, seams overlapped and 100% taped—zero holes or dirt exposed.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-foundation-rebar-dobies',
    title: 'Rebar Steel Grid & Yellow Chairs / Dobies',
    category: 'Rebar & Steel',
    description: 'Rebar grid & stirrups set on top of plastic sheeting, elevated with plenty of yellow rebar chairs/dobies so steel is suspended properly.',
    status: 'pending',
    photoUrl: null,
    note: ''
  }
];

export const INITIAL_FRAMING_ITEMS = [
  {
    id: 'item-framing-nail-pattern',
    title: 'OSB Sheathing Nail Pattern Inspection',
    category: 'Structural Framing',
    description: 'Standalone first framing inspection: Inspector checks exterior OSB wall panel nail spacing before house wrap or trades cover it.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-framing-rough-electrical',
    title: 'Rough Electrical Wiring, Nail Plates & Hot Wire Taping',
    category: 'Electrical Rough-In',
    description: 'Outlet/switch boxes set, Romex wire pulled, metal safety nail plates on studs within 1.25" of face, and white conductors used as hot/switch legs tagged with red tape in boxes.',
    status: 'pending',
    photoUrl: null,
    note: 'Verify all white conductors acting as hot/switch legs are re-identified with red electrical tape inside boxes.'
  },
  {
    id: 'item-framing-rough-plumbing',
    title: 'Rough Plumbing Top-Out & Roof Vent Valley Clearance',
    category: 'Plumbing Top-Out',
    description: 'PEX/copper supply lines run, waste & vent stacks extended through roof, and supply line pressure test.',
    status: 'pending',
    photoUrl: null,
    note: 'CRITICAL: Ensure plumber places roof vent stack penetrations far away from roof valleys where rain water runs heavy. Never place vent pipes near valleys!'
  },
  {
    id: 'item-framing-rough-hvac',
    title: 'Rough HVAC Ducts & Condensate Drain Lines Inspection',
    category: 'Mechanical / HVAC',
    description: 'Supply/return flex ducts hung, plenum box set, and A/C evaporator coil condensate drain lines routed properly.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-framing-stud-shoes',
    title: 'Notched/Bored Stud Structural Reinforcement (Metal Stud Shoes / Boots)',
    category: 'Plumbing Top-Out',
    description: 'When large holes or notches are cut in 2x4, 2x6, or 2x8 studs for plumbing drain/vent lines or dryer pipes, heavy metal stud shoes/boots must be installed over studs so they do not lose structural strength.',
    status: 'pending',
    photoUrl: null,
    note: 'CRITICAL: Plumber must install metal stud shoes over any 2x4, 2x6, or 2x8 studs notched/bored for plumbing drain lines so studs retain structural strength.'
  },
  {
    id: 'item-framing-attic-catwalk',
    title: 'Attic HVAC Access Catwalk & OSB Work Platform',
    category: 'Structural Framing',
    description: 'Construct solid OSB walkway path (min 24" wide) from attic hatch to AC air handler, plus a spacious OSB work platform around the unit for HVAC technicians to set tools and service equipment.',
    status: 'pending',
    photoUrl: null,
    note: 'CRITICAL: Build continuous OSB catwalk and spacious work deck around attic AC unit before HVAC installation.'
  },
  {
    id: 'item-framing-anchor-bolts-tight',
    title: 'Sill Plate Anchor Bolt & Washer Tightness Verification',
    category: 'Structural Framing',
    description: 'Check every perimeter wall sill plate anchor bolt to ensure plate washers are in place and hex nuts are fully torqued tight against pressure-treated bottom plates.',
    status: 'pending',
    photoUrl: null,
    note: 'Ensure all anchor bolt nuts around slab perimeter are fully tightened down against sill plates.'
  },
  {
    id: 'item-framing-windstorm-hardware',
    title: 'Windstorm Metal Ties & Hurricane Clip Hardware (TDI / WPI-8)',
    category: 'Structural Framing',
    description: 'Verify all required Windstorm structural hardware—hurricane clips (H2.5A/H10), twist straps, stud-to-plate ties, and Simpson Strong-Tie connectors—are installed with full nail counts at rafters, trusses, and wall framing.',
    status: 'pending',
    photoUrl: null,
    note: 'CRITICAL: Verify 100% of hurricane clips and windstorm tie-down metal plates are fully nailed per engineering specs.'
  },
  {
    id: 'item-framing-hvac-asbuilt-permit',
    title: 'HVAC As-Built Duct Layout & City Permit Revision Resubmittal',
    category: 'Mechanical / HVAC',
    description: 'Verify installed flex duct routing against city-approved HVAC plans. Obtain final as-built duct layout and CFM airflow calc from HVAC contractor and resubmit plan revisions to City Building Dept.',
    status: 'pending',
    photoUrl: null,
    note: 'CRITICAL BUILDER REMINDER: Resubmit updated as-built HVAC duct layout and CFM airflow plan to City after framing/duct rough-in.'
  },
  {
    id: 'item-framing-hvac-double-shield',
    title: 'Top-Plate HVAC Copper Line-Set Double Metal Safety Shield Plates',
    category: 'Mechanical / HVAC',
    description: 'Install double-thick galvanized metal safety shield plates at top wall plate where refrigerant copper line-sets penetrate to protect soft copper tubing from drywall screws and siding nails.',
    status: 'pending',
    photoUrl: null,
    note: 'CRITICAL: Install double metal safety plates at top plate copper line-set penetrations to prevent nail/screw punctures.'
  },
  {
    id: 'item-framing-hvac-pad-sewer-clearance',
    title: 'Exterior A/C Line-Set Wall Exit Clearance from Sewer Trench Soil',
    category: 'Mechanical / HVAC',
    description: 'Route exterior copper line-set wall exit point away from underground sewer pipe trenching to prevent the A/C concrete condenser pad from sinking into disturbed trench soil.',
    status: 'pending',
    photoUrl: null,
    note: 'CRITICAL: Keep exterior A/C line-set exit away from sewer main trench so A/C concrete pad sits on undisturbed solid ground.'
  },
  {
    id: 'item-framing-polyseal-penetrations',
    title: 'Poly Seal & Fireblocking Top/Bottom Plate Air Sealing',
    category: 'Poly Seal & Air Sealing',
    description: 'Poly sealant & red/orange fireblock foam applied at all top/bottom plate penetrations, wire holes, and plumbing penetrations before combo framing inspection.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-framing-window-foam',
    title: 'Exterior Window & Door Rough Opening Poly Seal Foam',
    category: 'Poly Seal & Air Sealing',
    description: 'Verify low-expansion foam seal is installed continuously around all exterior window and door frame perimeters to eliminate air draft leaks.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-framing-alarm-company',
    title: 'Security Alarm & Low-Voltage Pre-Wire Scheduling',
    category: 'Builder Coordination',
    description: 'Call security alarm company to run low-voltage window/door sensor wires, keypad leads, and camera wiring before insulation and drywall cover open wall studs.',
    status: 'pending',
    photoUrl: null,
    note: 'BUILDER REMINDER: Schedule alarm company to complete low-voltage pre-wire before insulation starts!'
  }
];

export const INITIAL_INSULATION_ITEMS = [
  {
    id: 'item-insulation-wall-batts',
    title: 'Exterior Wall Cavity Insulation (Batts / Spray Foam) Inspection',
    category: 'Wall Insulation',
    description: 'Verify batt or spray foam insulation fills all exterior wall cavities snugly with no gaps, voids, compression, or uninsulated space behind electrical boxes and plumbing pipes.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-insulation-spray-foam-roof',
    title: 'Attic Roof Deck & Gable Wall Spray Foam Insulation Depth',
    category: 'Spray Foam Insulation',
    description: 'Inspect open-cell / closed-cell spray foam insulation applied to roof deck underside and gable walls for required thickness depth and 100% continuous air seal coverage.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-insulation-tub-backing',
    title: 'Exterior Wall Tub & Shower Unit Backing Insulation',
    category: 'Wall Insulation',
    description: 'Confirm exterior walls behind bathtubs and shower enclosures are 100% insulated and sealed before plumbing fixtures are permanently set.',
    status: 'pending',
    photoUrl: null,
    note: ''
  }
];

export const INITIAL_INFILTRATION_ITEMS = [
  {
    id: 'item-infiltration-blower-door',
    title: 'HERS Test — Blower Door Air Infiltration Test (ACH50 Rating)',
    category: 'HERS Testing',
    description: 'Certified HERS Rater performs blower door fan pressure test at 50 Pascals to measure total building air infiltration (ACH50 rate) per energy code requirements.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-infiltration-duct-blaster',
    title: 'HERS Test — Duct Blaster Air Duct Leakage Pressure Test',
    category: 'HERS Testing',
    description: 'Certified HERS Rater performs duct blaster pressure test at 25 Pascals to measure total flex duct air leakage CFM to outside to verify duct tightness compliance.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-infiltration-envelope-sealing',
    title: 'Attic Hatch, Recessed Cans & Exterior Threshold Sealing',
    category: 'Air Sealing & Ventilation',
    description: 'Verify weatherstripping and gaskets on attic access hatch/pull-down stairs, airtight IC-rated recessed light fixture housings, and exterior door threshold sweeps.',
    status: 'pending',
    photoUrl: null,
    note: ''
  }
];

export const INITIAL_FINAL_ITEMS = [
  {
    id: 'item-final-hvac-foam-insulation',
    title: 'Suction Line & Condensate Pipe Foam Insulation (Armaflex)',
    category: 'Mechanical / HVAC Final',
    description: 'Wrap 100% of cold copper suction refrigerant lines and condensate drain pipes with black foam insulation sleeve (Armaflex/Rubatex) with sealed joints to prevent pipe sweating.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-final-hvac-float-switch',
    title: 'A/C Evaporator Coil Emergency Drain Pan Float Switch',
    category: 'Mechanical / HVAC Final',
    description: 'Install emergency float cutoff switch (Inline / secondary pan Safe-T-Switch) on EVERY A/C unit (closet or attic) to automatically shut off system if drain line clogs.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-final-hvac-exterior-wall-plate',
    title: 'Exterior Wall Line-Set Escutcheon Flashing Plate & Aluminum UV Wrap',
    category: 'Mechanical / HVAC Final',
    description: 'Install wall escutcheon flashing plate around exterior line-set penetration and cover exterior foam pipe insulation with UV-resistant aluminum jacket/wrap for energy inspection approval.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-final-hvac-closet-door-seal',
    title: 'Interior A/C Closet Door Return Compartment Gasket Pad & Door Bottom Sweep Seal',
    category: 'Mechanical / HVAC Final',
    description: 'For closet-installed A/C units, install door perimeter gasket pad to seal return plenum bottom compartment from top section, and install bottom door sweep seal to prevent floor dust from sucking under door gap.',
    status: 'pending',
    photoUrl: null,
    note: 'CRITICAL: Install A/C closet door gasket pad and door bottom sweep seal so return plenum does not suck in floor dust.'
  },
  {
    id: 'item-final-exterior-drain-pipes-6in',
    title: 'Exterior Condensate & Drain Line Terminations Pointed Down 6 In. Above Grade',
    category: 'Mechanical / HVAC Final',
    description: 'Plumber and HVAC trades must cut all exterior PVC/copper drain line penetrations (A/C condensate lines, T&P relief valve lines, pan drains), elbow them downward facing the ground, and terminate exactly 6 inches above final grade level.',
    status: 'pending',
    photoUrl: null,
    note: 'CRITICAL: Plumber & HVAC trades must point all exterior drain pipes down and cut 6 in. above final ground level.'
  },
  {
    id: 'item-final-hvac-attic-ladder',
    title: 'Stepladder / Access Ladder On-Site for Attic A/C Unit Inspection',
    category: 'Mechanical / HVAC Final',
    description: 'If A/C equipment or air handlers are located in the attic space, builder must supply a safe, sturdy stepladder / extension ladder on-site so city inspector can access attic unit.',
    status: 'pending',
    photoUrl: null,
    note: 'CRITICAL: Supply stepladder on-site for city inspector to access attic A/C unit.'
  },
  {
    id: 'item-final-electrical-trim',
    title: 'Electrical Receptacle, Switch & Main Panel Final Trim',
    category: 'Electrical Final',
    description: 'Verify GFCI/AFCI protection, tamper-resistant outlets, cover plates installed, light fixtures operating, and main electrical breaker panel index schedule fully labeled.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-final-electric-service-conduit-anchor',
    title: 'Underground Electric Meter Service Riser Conduit Wall Anchor Bolts',
    category: 'Electrical Final',
    description: 'Utility trench crew digs underground trench and supplies main service conduit to meter box. Electrician must securely bolt the vertical conduit riser to the exterior wall with heavy-duty anchor bolts and straps before electric company hookup.',
    status: 'pending',
    photoUrl: null,
    note: 'CRITICAL: Electrician must bolt underground service riser conduit securely to wall with anchor bolts prior to utility hookup.'
  },
  {
    id: 'item-final-plumbing-trim',
    title: 'Plumbing Fixtures, Toilets & Water Heater Discharge Pipe',
    category: 'Plumbing Final',
    description: 'Verify all faucets, toilets, sinks, and tub trims function with zero leaks, water heater T&P relief valve discharge pipe terminates outside/drain pan, and main shutoff is accessible.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-final-smoke-alarms',
    title: 'Interconnected Smoke & Carbon Monoxide Alarm Testing',
    category: 'Life Safety & Building Final',
    description: 'Test all hardwired, interconnected smoke detectors in bedrooms/hallways and carbon monoxide alarms for audible sound and battery backup power.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-final-garage-door-self-close',
    title: 'Garage-to-House Entry Door Self-Closing Spring Hinge Pins Set',
    category: 'Life Safety & Building Final',
    description: 'Adjust and set tension pins on spring hinges for the fire-rated garage-to-house interior entry door so it automatically self-closes and latches shut completely.',
    status: 'pending',
    photoUrl: null,
    note: 'CRITICAL: Set spring hinge tension pins on garage entry door so door fully self-closes and latches prior to final inspection.'
  },
  {
    id: 'item-final-co-signoff',
    title: 'City Certificate of Occupancy (C.O.) Green Card Sign-Off',
    category: 'Paperwork & C.O.',
    description: 'Obtain final municipal building inspector green card sign-off and official Certificate of Occupancy (C.O.) document.',
    status: 'pending',
    photoUrl: null,
    note: ''
  },
  {
    id: 'item-final-rescheck-cert',
    title: 'Permanent Energy Compliance Certificate (REScheck) Posted inside Electrical Panel',
    category: 'Paperwork & C.O.',
    description: 'Obtain the official REScheck energy compliance report form and attach the permanent printed Energy Compliance Certificate sticker/label directly inside the main electrical breaker panel box door for final inspector verification.',
    status: 'pending',
    photoUrl: null,
    note: 'CRITICAL: Post printed REScheck Energy Compliance Certificate inside main electrical breaker panel door prior to final inspection.'
  },
  {
    id: 'item-final-stamped-driveway-letter',
    title: 'Decorative / Stamped Concrete Driveway Responsibility Letter Filed with City',
    category: 'Paperwork & C.O.',
    description: 'If a stamped or decorative concrete driveway/apron is installed, submit signed City Decorative Driveway Release & Maintenance Responsibility letter to Building Department prior to final C.O.',
    status: 'pending',
    photoUrl: null,
    note: 'BUILDER REMINDER: If stamped driveway installed, submit signed Stamped Driveway Letter to City for final C.O.'
  }
];

const INSPECTION_STORAGE_PREFIX = 'jobscan_inspections_';

export function getInspectionStorageKey(projectId, stageId) {
  const proj = String(projectId || 'default').trim().toLowerCase();
  const stage = String(stageId || 'rough-in-plumbing').trim().toLowerCase();
  return `${INSPECTION_STORAGE_PREFIX}${proj}_${stage}`;
}

export function loadInspectionData(projectId, stageId = 'rough-in-plumbing') {
  let defaults = [];
  if (stageId === 'rough-in-plumbing') defaults = INITIAL_PLUMBING_ITEMS;
  if (stageId === 'foundation') defaults = INITIAL_FOUNDATION_ITEMS;
  if (stageId === 'framing') defaults = INITIAL_FRAMING_ITEMS;
  if (stageId === 'insulation') defaults = INITIAL_INSULATION_ITEMS;
  if (stageId === 'infiltration') defaults = INITIAL_INFILTRATION_ITEMS;
  if (stageId === 'final') defaults = INITIAL_FINAL_ITEMS;

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const key = getInspectionStorageKey(projectId, stageId);
      const stored = window.localStorage.getItem(key);
      if (stored) {
        let parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Clear notes for infiltration and insulation stages if present, as well as Poly Seal framing items
          if (stageId === 'infiltration' || stageId === 'insulation') {
            parsed = parsed.map(i => ({ ...i, note: '' }));
          }
          if (stageId === 'framing') {
            parsed = parsed.map(i => (i.id.includes('polyseal') || i.id.includes('window-foam')) ? { ...i, note: '' } : i);
          }

          // Cleanup IDs moved between stages
          const removedIds = stageId === 'insulation'
            ? new Set(['item-insulation-polyseal-penetrations', 'item-insulation-window-foam', 'item-insulation-soffit-baffles'])
            : stageId === 'infiltration'
              ? new Set(['item-infiltration-fresh-air'])
              : new Set(['item-framing-hvac-foam-insulation', 'item-framing-hvac-float-switch', 'item-framing-hvac-exterior-wall-plate-aluminum']);

          parsed = parsed.filter(i => !removedIds.has(i.id));

          // Merge any missing default items by ID so new items automatically appear
          const existingIds = new Set(parsed.map(i => i.id));
          const missingDefaults = defaults.filter(d => !existingIds.has(d.id));
          if (missingDefaults.length > 0 || parsed.length !== JSON.parse(stored).length) {
            const merged = [...parsed, ...missingDefaults.filter(d => !existingIds.has(d.id))];
            saveInspectionData(projectId, stageId, merged);
            return merged;
          }
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load inspection data from localStorage:', err);
  }

  return defaults;
}

export function saveInspectionData(projectId, stageId, items) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const key = getInspectionStorageKey(projectId, stageId);
      window.localStorage.setItem(key, JSON.stringify(items));
    }
  } catch (err) {
    console.error('Failed to save inspection data to localStorage:', err);
  }
  return items;
}
