import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Mic,
  Send,
  AlertTriangle,
  Users,
  Clock,
  CheckCircle2,
  Trash2,
  Phone,
  MessageSquare,
  Sparkles,
  Bot,
  Volume2,
  VolumeX,
  Settings,
  X,
  Plus,
  Layers,
  MapPin,
  HardHat,
  CheckSquare,
  Calendar,
  Edit2,
  Check,
  RotateCcw,
  Flag,
  ListTodo
} from 'lucide-react';
import {
  loadBrainItems,
  saveBrainItems,
  parseFieldNote,
  playChimeAlert,
  askGeminiBrain,
  loadGlobalPhases,
  saveGlobalPhases,
  resetGlobalPhases,
  loadGlobalSiteSetupProtocol,
  saveGlobalSiteSetupProtocol,
  resetGlobalSiteSetupProtocol,
  loadProjectDriveTree,
  saveProjectDriveTree
} from '../services/builderBrainService';
import { fetchProjectDriveTree, createFolder, trashDriveFileOrFolder } from '../services/googleDrive';

export const DEFAULT_SITE_SETUP_PROTOCOL = {
  id: 'site_setup_protocol',
  name: 'Site Setup & Lot Mobilization',
  shortName: 'Site Setup',
  trade: 'Site Prep & Utilities',
  icon: '🚩',
  preTradeNotes: [
    'Set temporary hose bibb with anti-siphon vacuum breaker on water meter line.',
    'Erect permit board with visible Lot # and city building permit in clear weatherproof pouch.',
    'Install erosion control barrier / silt fencing along lot boundaries to prevent dirt runoff.',
    'Ensure port-a-potty / temporary toilet is delivered and visible at front of lot.',
    'Verify city utility water meter is requested, set, and active prior to temp plumbing connections.'
  ],
  inspectionChecklist: [
    { id: 'ss_water_meter', text: 'City Water Meter Set & Installed' },
    { id: 'ss_vacuum_breaker', text: 'Temporary Hose Faucet with Vacuum Breaker (Backflow Preventer)' },
    { id: 'ss_permit_board', text: 'Lot Number & City Building Permit Board Posted On-Site' },
    { id: 'ss_erosion_control', text: 'Erosion Control Barrier / Silt Fencing' },
    { id: 'ss_port_a_potty', text: 'Port-A-Potty / Temporary Toilet Delivered On-Site' }
  ]
};

export const DEFAULT_CONSTRUCTION_PHASES = [
  {
    id: 'plumbing',
    name: '1. Plumbing Rough-In',
    shortName: '1. Plumbing',
    trade: 'Plumber',
    icon: '🚰',
    preTradeNotes: [
      'Sleeve all supply and drain lines passing under form boards or future concrete footings.',
      'Maintain minimum 1/4" per foot slope on underground sewer lines with sand bedding.',
      'Fill vertical 8-9ft stack pipe with water to 100% pressure test all underground drain lines before backfilling.',
      'Protect water lines from exterior wall freezing pockets.',
      'Install metal nail plates on all studs notched or drilled within 1.25" of face.',
      'Once inspection passes: Plumber must cap/seal all open pipe ends tightly and backfill trenches with sand/dirt to protect pipes before slab prep.'
    ],
    inspectionChecklist: [
      { id: 'p1', text: 'Water lines pressure tested at 50+ PSI (gauge held for 15+ mins)' },
      { id: 'p2', text: 'Water Head / Stack Pressure Test (8-9ft vertical stack filled with water to roof)' },
      { id: 'p3', text: 'Drain & waste pipe trenching, sand bedding & 1/4" per ft slopes verified' },
      { id: 'p4', text: 'Pipe sleeve protectors installed under form boards and concrete footings' },
      { id: 'p5', text: 'Nail plates installed on all stud & joist penetrations within 1.25"' },
      { id: 'p6', text: 'Cleanout access plugs installed and accessible' },
      { id: 'p7', text: 'Shower pan test completed & holding water' },
      { id: 'p8', text: 'Post-inspection pipe capping & trench backfill verified before slab prep' }
    ]
  },
  {
    id: 'foundation',
    name: '2. Foundation',
    shortName: '2. Foundation',
    trade: 'Concrete & Foundation',
    icon: '🏗️',
    preTradeNotes: [
      'Pad dirt scraped, leveled, and form boards staked securely with neat square trenches and clean diagonals.',
      'Dig stirrup & grade beam trenches down at least 12 inches into undisturbed soil (verify natural soil layer color change).',
      'Spray early-morning termite chemical soil pre-treatment directly across dirt trenches before vapor barrier is laid.',
      'Lay plastic vapor barrier immediately over treated soil; overlap and tape 100% of seams—zero holes or dirt exposed.',
      'Elevate rebar grid & stirrups with yellow rebar chairs/dobies so steel is suspended properly.',
      'Attach and bond 20ft #4 rebar Ufer grounding electrode and verify accessibility.',
      'String/yarn setback lines strung across form boards for inspector to verify property line setbacks.'
    ],
    inspectionChecklist: [
      { id: 'fnd1', text: 'Pad dirt leveling, formwork & trench squareness / diagonals verified' },
      { id: 'fnd2', text: '12-inch minimum undisturbed soil depth verified for stirrups & grade beams' },
      { id: 'fnd3', text: 'Early-morning termite soil pre-treatment applied before plastic' },
      { id: 'fnd4', text: 'Vapor barrier sheeting 100% lapped, taped, and undamaged' },
      { id: 'fnd5', text: 'Rebar steel grid elevated on yellow chairs / dobies with proper clearances' },
      { id: 'fnd6', text: 'Ufer grounding electrode bonded, attached, and accessible' },
      { id: 'fnd7', text: 'String / yarn setback lines verified against approved plot plan' },
      { id: 'fnd8', text: 'Plumbing blockouts and sleeve locations verified before pour' }
    ]
  },
  {
    id: 'framing_combo',
    name: '3. Framing Combo (Elec / Mech / Plumb / Poly Seal)',
    shortName: '3. Framing Combo',
    trade: 'Combined 5-Trade Inspection',
    icon: '🪵',
    hasSubcategories: true,
    subcategories: [
      {
        id: 'sub_framing',
        name: 'Framing & Sheathing',
        trade: 'Framer',
        icon: '🪵',
        preTradeNotes: [
          'Verify window & door rough opening (R.O.) dimensions per manufacturer cut sheets.',
          'Ensure 3-stud corners for drywall backing and double joists under heavy load areas.',
          'CRITICAL: Verify 100% of hurricane clips (H2.5A/H10), twist straps, and windstorm tie-down metal plates are fully nailed per engineering specs (TDI/WPI-8).',
          'Check every perimeter sill plate anchor bolt to ensure plate washers are in place and hex nuts are fully torqued tight against bottom plates.',
          'CRITICAL: Build continuous OSB catwalk (min 24" wide) from attic hatch to AC unit, plus spacious OSB work deck around unit before HVAC installation.'
        ],
        inspectionChecklist: [
          { id: 'fc_f1', text: 'OSB sheathing nail pattern verified (6" edge / 12" field)' },
          { id: 'fc_f2', text: 'Windstorm metal ties & hurricane clip hardware (TDI / WPI-8) 100% nailed' },
          { id: 'fc_f3', text: 'Truss hanger structural nails fully installed (zero missing nails)' },
          { id: 'fc_f4', text: 'Sill plate anchor bolt & washer tightness verified around perimeter' },
          { id: 'fc_f5', text: 'Attic HVAC access catwalk (24" min) & spacious OSB work platform constructed' },
          { id: 'fc_f6', text: 'Header sizes and load-bearing studs match structural plan callouts' }
        ]
      },
      {
        id: 'sub_electrical',
        name: 'Rough Electrical',
        trade: 'Electrician',
        icon: '⚡',
        preTradeNotes: [
          'Ensure main panel box has 36" depth clearance per NEC code.',
          'Set box depths for 1/2" drywall thickness.',
          'Verify all white conductors acting as hot/switch legs are re-identified with red electrical tape inside boxes.',
          'Install safety nail plates wherever Romex cables pass closer than 1.25" to stud face.',
          'BUILDER REMINDER: Schedule security alarm company to run low-voltage pre-wire (sensors, keypads, cameras) before insulation starts!'
        ],
        inspectionChecklist: [
          { id: 'fc_e1', text: 'Grounding electrode conductor (Ufer ground) attached and bonded' },
          { id: 'fc_e2', text: 'Rough electrical wiring, box depths & nail plates within 1.25" of stud face' },
          { id: 'fc_e3', text: 'White conductor hot/switch legs tagged with red tape inside boxes' },
          { id: 'fc_e4', text: 'Dedicated circuits for microwave, refrigerator, and sump pump wired' },
          { id: 'fc_e5', text: 'Smoke & CO detector box rough-ins placed at code heights' },
          { id: 'fc_e6', text: 'Security alarm & low-voltage pre-wire verified before insulation' }
        ]
      },
      {
        id: 'sub_hvac',
        name: 'Rough HVAC & Mechanicals',
        trade: 'HVAC Sub',
        icon: '❄️',
        preTradeNotes: [
          'Mastic seal all supply and return flex duct joints before insulation wrap.',
          'CRITICAL: Install double-thick galvanized metal safety shield plates at top wall plate where refrigerant copper line-sets penetrate.',
          'CRITICAL: Keep exterior A/C copper line-set wall exit point away from sewer main trench so A/C concrete condenser pad sits on undisturbed solid ground.',
          'CRITICAL BUILDER REMINDER: Obtain final as-built duct layout and CFM airflow plan from HVAC sub and resubmit plan revisions to City Building Dept.',
          'Ensure condensate drain lines have minimum 1/8" per ft pitch to visible exterior discharge.'
        ],
        inspectionChecklist: [
          { id: 'fc_h1', text: 'Ductwork joints 100% mastic sealed & hung with proper strapping' },
          { id: 'fc_h2', text: 'Top-plate HVAC copper line-set double metal safety shield plates installed' },
          { id: 'fc_h3', text: 'Exterior A/C line-set wall exit cleared from sewer trench soil' },
          { id: 'fc_h4', text: 'HVAC as-built duct layout & CFM airflow plan resubmitted to City' },
          { id: 'fc_h5', text: 'Flue vent clearances to combustibles verified' },
          { id: 'fc_h6', text: 'Condensate secondary drain line routed to visible exterior discharge' }
        ]
      },
      {
        id: 'sub_plumbing',
        name: 'Rough Plumbing Top-Out',
        trade: 'Plumber',
        icon: '🚰',
        preTradeNotes: [
          'CRITICAL: Ensure plumber places roof vent stack penetrations far away from roof valleys where rain water runs heavy. Never place vent pipes near valleys!',
          'CRITICAL: Plumber must install heavy metal stud shoes/boots over any 2x4, 2x6, or 2x8 studs notched or bored for plumbing drain/vent lines.',
          'Verify all vent pipes penetrate roof at required heights with approved flashing boots.',
          'Ensure water supply lines and drain stub-outs are properly anchored, centered, and pressure tested.'
        ],
        inspectionChecklist: [
          { id: 'fc_p1', text: 'Roof vent stacks placed far away from roof valleys and sealed with flashing boots' },
          { id: 'fc_p2', text: 'Notched/bored stud structural reinforcement (metal stud shoes/boots) installed' },
          { id: 'fc_p3', text: 'Water supply lines pressure tested and holding without drop' },
          { id: 'fc_p4', text: 'Drain & vent stacks strapped, aligned, and sealed through plates' },
          { id: 'fc_p5', text: 'Nail plates installed on all stud & plate penetrations within 1.25"' }
        ]
      },
      {
        id: 'sub_polyseal',
        name: 'Poly Seal & Air Sealing',
        trade: 'Air Sealing Sub',
        icon: '🛡️',
        preTradeNotes: [
          'Apply poly sealant & red/orange fireblock foam at all top/bottom plate penetrations, wire holes, and pipe holes.',
          'Verify low-expansion foam seal is installed continuously around all exterior window and door rough openings.',
          'Install draft stopping in all concealed vertical and horizontal wall chases and behind tubs/showers.'
        ],
        inspectionChecklist: [
          { id: 'fc_s1', text: 'Red/orange fireblock foam installed at all electrical, plumbing, & duct penetrations' },
          { id: 'fc_s2', text: 'Exterior window and door rough openings 100% poly sealed with low-expansion foam' },
          { id: 'fc_s3', text: 'Exterior wall bottom plates caulked/sealed to concrete slab' },
          { id: 'fc_s4', text: 'Concealed drop ceilings, soffits, and tub/shower chases draft stopped' }
        ]
      }
    ]
  },
  {
    id: 'insulation',
    name: '4. Insulation',
    shortName: '4. Insulation',
    trade: 'Insulation Sub',
    icon: '🧱',
    preTradeNotes: [
      'Verify batt or spray foam insulation fills all exterior wall cavities snugly with no gaps, voids, compression, or uninsulated space behind electrical boxes and plumbing pipes.',
      'Inspect open-cell / closed-cell spray foam insulation applied to roof deck underside and gable walls for required thickness depth and 100% continuous air seal coverage.',
      'Confirm exterior walls behind bathtubs and shower enclosures are 100% insulated and sealed before plumbing fixtures are permanently set.',
      'Install baffle vents in soffit overhangs to prevent airflow blockage to attic.'
    ],
    inspectionChecklist: [
      { id: 'ins1', text: 'Exterior wall cavity insulation (batts/spray foam) filled with zero gaps or voids' },
      { id: 'ins2', text: 'Attic roof deck & gable wall spray foam insulation depth verified for continuous air seal' },
      { id: 'ins3', text: 'Exterior wall tub & shower unit backing insulation 100% verified' },
      { id: 'ins4', text: 'Baffles installed at soffit vents to prevent attic insulation blockage' },
      { id: 'ins5', text: 'Draft stopping / fireblocking verified behind tubs and fireplace chases' }
    ]
  },
  {
    id: 'infiltration',
    name: '5. Infiltration & Energy',
    shortName: '5. Infiltration',
    trade: 'Energy Rater / HVAC',
    icon: '💨',
    preTradeNotes: [
      'Schedule certified HERS Rater to perform blower door fan pressure test at 50 Pascals (ACH50 rating) per energy code.',
      'Schedule certified HERS Rater to perform duct blaster air duct leakage pressure test at 25 Pascals (CFM to outside).',
      'Verify weatherstripping and gaskets on attic access hatch / pull-down stairs, IC-rated airtight recessed light cans, and exterior door sweeps.'
    ],
    inspectionChecklist: [
      { id: 'inf1', text: 'HERS Blower Door air infiltration test (ACH50 rating) passed' },
      { id: 'inf2', text: 'HERS Duct Blaster air duct leakage pressure test passed' },
      { id: 'inf3', text: 'Attic access hatch weatherstripped and insulated with R-38 cover' },
      { id: 'inf4', text: 'Recessed light cans IC-rated and sealed airtight to drywall' },
      { id: 'inf5', text: 'Exterior door sweeps and weatherstrip seals verified' }
    ]
  },
  {
    id: 'final_co',
    name: '6. Final Inspection (C.O.)',
    shortName: '6. Final (C.O.)',
    trade: 'Multi-Trade Final',
    icon: '🔑',
    hasSubcategories: true,
    subcategories: [
      {
        id: 'sub_final_hvac',
        name: 'Mechanical & HVAC Final',
        trade: 'HVAC Sub',
        icon: '❄️',
        preTradeNotes: [
          'Wrap 100% of cold copper suction refrigerant lines and condensate pipes with black foam insulation (Armaflex) with sealed joints.',
          'Install emergency float cutoff switch (Inline / secondary pan Safe-T-Switch) on EVERY A/C unit (closet or attic).',
          'Install wall escutcheon flashing plate around exterior line-set penetration and cover foam insulation with UV-resistant aluminum jacket.',
          'CRITICAL: For closet A/C units, install door perimeter gasket pad to seal return plenum bottom compartment, and install bottom door sweep seal.',
          'CRITICAL: Plumber and HVAC trades must cut all exterior drain line penetrations (A/C condensate, T&P relief, pan drains), elbow them downward facing the ground, and terminate exactly 6 inches above final grade.',
          'CRITICAL: Builder must supply a safe, sturdy stepladder / extension ladder on-site for city inspector to access attic A/C unit.'
        ],
        inspectionChecklist: [
          { id: 'fin_h1', text: 'Suction line & condensate pipes 100% wrapped with Armaflex foam insulation' },
          { id: 'fin_h2', text: 'A/C evaporator coil emergency drain pan float cutoff safety switch installed and tested' },
          { id: 'fin_h3', text: 'Exterior line-set wall escutcheon plate and aluminum UV protective wrap installed' },
          { id: 'fin_h4', text: 'Interior A/C closet door return compartment gasket pad & door bottom sweep seal installed' },
          { id: 'fin_h5', text: 'Exterior condensate & drain pipes elbowed downward and terminated 6" above finished grade' },
          { id: 'fin_h6', text: 'Stepladder / access ladder available on-site for attic A/C unit inspection' },
          { id: 'fin_h7', text: 'Thermostat calibrated and heating/cooling operational' }
        ]
      },
      {
        id: 'sub_final_electrical',
        name: 'Electrical Final',
        trade: 'Electrician',
        icon: '⚡',
        preTradeNotes: [
          'CRITICAL: Electrician must securely bolt the underground vertical conduit riser to the exterior wall with heavy-duty anchor bolts and straps before electric company hookup.',
          'Label 100% of breaker circuits clearly in the main panel directory.',
          'CRITICAL: Post permanent printed Energy Compliance Certificate (REScheck) inside main electrical breaker panel box door.',
          'Test all GFCI & AFCI circuits in kitchen, baths, laundry, garage, and exterior.',
          'Mount cover plates on all receptacles, switches, and junction boxes.'
        ],
        inspectionChecklist: [
          { id: 'fin_e1', text: 'Underground electric meter service riser conduit anchored to exterior wall with heavy-duty bolts' },
          { id: 'fin_e2', text: 'Main breaker panel directory fully labeled with circuit schedules' },
          { id: 'fin_e3', text: 'Permanent printed REScheck Energy Compliance Certificate posted inside main panel door' },
          { id: 'fin_e4', text: 'All GFCI & AFCI outlets trip and reset properly with test tool' },
          { id: 'fin_e5', text: 'Interconnected smoke and carbon monoxide alarms tested with battery backup active' },
          { id: 'fin_e6', text: 'Exterior weather-resistant in-use outlet covers installed' }
        ]
      },
      {
        id: 'sub_final_plumbing',
        name: 'Plumbing Final',
        trade: 'Plumber',
        icon: '🚰',
        preTradeNotes: [
          'Run all fixtures (sinks, tubs, showers, toilets) under full water pressure with zero leaks.',
          'CRITICAL: Verify water heater temperature & pressure (T&P) relief valve discharge line is copper/CPVC, pitched down, and terminates to approved exterior location 6" above grade.',
          'Verify anti-siphon vacuum breaker devices installed on all exterior hose bibbs.',
          'Confirm main water shutoff valve is tagged and easily accessible.'
        ],
        inspectionChecklist: [
          { id: 'fin_p1', text: 'All plumbing fixtures, sinks, faucets, toilets, and shutoff valves verified 100% leak-free' },
          { id: 'fin_p2', text: 'Water heater T&P relief valve discharge line pitched down to exterior / approved drain' },
          { id: 'fin_p3', text: 'Anti-siphon vacuum breakers installed on all exterior hose bibbs' },
          { id: 'fin_p4', text: 'Sewer cleanouts capped, accessible, and flush with finished grade' }
        ]
      },
      {
        id: 'sub_final_contractor',
        name: 'Contractor Final Checks',
        trade: 'General Builder / Finishes',
        icon: '🔑',
        preTradeNotes: [
          'CRITICAL: Adjust and set tension pins on spring hinges for fire-rated garage-to-house door so it automatically self-closes and latches completely.',
          'CRITICAL BUILDER REMINDER: If a stamped or decorative concrete driveway/apron is installed, submit signed City Decorative Driveway Release & Maintenance Responsibility letter to Building Department prior to final C.O.',
          'Inspect stair handrails and guardrails for code height and <4" baluster spacing.',
          'Confirm attic access hatch has weatherstrip gasket and R-38+ insulation cover.',
          'Confirm building address numbers are visible from the street.'
        ],
        inspectionChecklist: [
          { id: 'fin_c1', text: 'Garage-to-house entry door self-closes and latches automatically with spring hinge pins' },
          { id: 'fin_c2', text: 'Decorative / stamped concrete driveway responsibility letter submitted to City (if applicable)' },
          { id: 'fin_c3', text: 'City Certificate of Occupancy (C.O.) green card sign-off prepared and scheduled' },
          { id: 'fin_c4', text: 'Stair handrails continuous and guardrail baluster spacing under 4 inches' },
          { id: 'fin_c5', text: 'Attic access opening weatherstripped and insulated' },
          { id: 'fin_c6', text: 'Window sashes operate smoothly, lock securely, and safety glazing verified in wet areas' }
        ]
      }
    ]
  }
];

export default function BuilderBrain({ activeProject, selectedFolder, googleToken }) {
  const projectId = activeProject?.id || selectedFolder?.name || 'default_site';
  const projectName = activeProject?.name || selectedFolder?.name || 'Active Job Site';

  const [items, setItems] = useState([]);
  const [activeSubTab, setActiveSubTab] = useState('all'); // 'all' | 'site_setup' | 'phases' | 'watchout' | 'subcontractor' | 'reminder'
  const [quickInput, setQuickInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [driveTree, setDriveTree] = useState(() => loadProjectDriveTree(projectId));

  useEffect(() => {
    if (googleToken && activeProject?.folderId) {
      fetchProjectDriveTree(googleToken, activeProject.folderId).then((tree) => {
        if (tree) {
          setDriveTree(tree);
          saveProjectDriveTree(projectId, tree);
        }
      });
    }
  }, [googleToken, activeProject?.folderId, projectId]);

  // Site Setup state (Unified 2-Step Protocol)
  const [siteSetupProtocol, setSiteSetupProtocol] = useState(() => loadGlobalSiteSetupProtocol(DEFAULT_SITE_SETUP_PROTOCOL));
  const [siteSetupChecks, setSiteSetupChecks] = useState(() => {
    try {
      const raw = localStorage.getItem('jobscan_sitesetup_checks_' + projectId);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [isCustomizingSetup, setIsCustomizingSetup] = useState(false);
  const [editingSetupPreNoteIdx, setEditingSetupPreNoteIdx] = useState(null);
  const [editingSetupPreNoteText, setEditingSetupPreNoteText] = useState('');
  const [showAddSetupPreNote, setShowAddSetupPreNote] = useState(false);
  const [newSetupPreNoteInput, setNewSetupPreNoteInput] = useState('');

  const [editingSetupAuditId, setEditingSetupAuditId] = useState(null);
  const [editingSetupAuditText, setEditingSetupAuditText] = useState('');
  const [showAddSetupAudit, setShowAddSetupAudit] = useState(false);
  const [newSetupAuditInput, setNewSetupAuditInput] = useState('');

  // 6 Municipal Stages state (Global & Editable)
  const [phases, setPhases] = useState(() => loadGlobalPhases(DEFAULT_CONSTRUCTION_PHASES));
  const [activePhaseId, setActivePhaseId] = useState('plumbing');
  const [phaseCheckState, setPhaseCheckState] = useState({});
  const [isCustomizing, setIsCustomizing] = useState(false);

  // Editing state for Pre-Work Notes
  const [editingPreNoteKey, setEditingPreNoteKey] = useState(null);
  const [editingPreNoteText, setEditingPreNoteText] = useState('');
  const [addingPreNoteSubId, setAddingPreNoteSubId] = useState(null);
  const [newPreNoteInput, setNewPreNoteInput] = useState('');

  // Editing state for Audit Checklist
  const [editingAuditId, setEditingAuditId] = useState(null);
  const [editingAuditText, setEditingAuditText] = useState('');
  const [addingAuditSubId, setAddingAuditSubId] = useState(null);
  const [newAuditInput, setNewAuditInput] = useState('');

  // AI Assistant Chat state
  const [aiMessages, setAiMessages] = useState([
    {
      sender: 'ai',
      text: `👋 Hey Boss! I'm your Adepec Builder Brain Assistant for "${projectName}". Ask me anything about lot setup, inspections, reminders, subcontractor calls, or dashboard expenses & budgets!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState('');
  const [aiLanguage, setAiLanguage] = useState(() => localStorage.getItem('jobscan_ai_lang') || 'auto');
  const [apiKey, setApiKey] = useState(localStorage.getItem('jobscan_gemini_key') || '');
  const [showSettings, setShowSettings] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const loadedPhases = loadGlobalPhases(DEFAULT_CONSTRUCTION_PHASES);
    setPhases(loadedPhases);
  }, []);

  useEffect(() => {
    const loaded = loadBrainItems(projectId);
    setItems(loaded);
  }, [projectId]);

  useEffect(() => {
    if (items.length > 0) {
      saveBrainItems(projectId, items);
    }
  }, [items, projectId]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiMessages, aiLoading]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('jobscan_sitesetup_checks_' + projectId);
      setSiteSetupChecks(raw ? JSON.parse(raw) : {});
    } catch {
      setSiteSetupChecks({});
    }
  }, [projectId]);

  const toggleSiteSetupCheck = (id) => {
    const next = { ...siteSetupChecks, [id]: !siteSetupChecks[id] };
    setSiteSetupChecks(next);
    localStorage.setItem('jobscan_sitesetup_checks_' + projectId, JSON.stringify(next));
  };

  useEffect(() => {
    const loadVoices = () => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en') || v.lang.startsWith('es'));
        voices.sort((a, b) => {
          const aNat = a.name.includes('Natural') || a.name.includes('Google') || a.name.includes('Neural');
          const bNat = b.name.includes('Natural') || b.name.includes('Google') || b.name.includes('Neural');
          if (aNat && !bNat) return -1;
          if (!aNat && bNat) return 1;
          return 0;
        });
        setAvailableVoices(voices);
        if (voices.length > 0 && !selectedVoiceURI) {
          setSelectedVoiceURI(voices[0].voiceURI);
        }
      }
    };
    loadVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      items.forEach((item) => {
        if (item.category === 'reminder' && item.status === 'pending' && item.targetDate && !item.alerted) {
          const target = new Date(item.targetDate);
          if (now >= target) {
            playChimeAlert();
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(`⏰ Adepec Field Alert: ${item.lot || projectName}`, {
                body: item.title,
                icon: '/vite.svg'
              });
            }
            setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, alerted: true } : i)));
          }
        }
      });
    }, 15000);
    return () => clearInterval(timer);
  }, [items, projectName]);

  const speakText = (text) => {
    if (!speechEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*_#🚨⏰👷📍•]/g, '').replace(/[\[\]]/g, '').replace(/\n+/g, '. ');
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 0.98;

      const isSpanish = /[áéíóúüñ¿¡]/i.test(text) || /\b(el|la|los|las|un|una|del|por|para|con|este|esta|lote|plomero|electricista|dinero|gastado|cuanto|quien|recordatorio|buenos|dias|tardes|hola|subcontratista|factura|presupuesto)\b/i.test(text);

      if (isSpanish || aiLanguage === 'es') {
        utterance.lang = 'es-US';
        const spanishVoice = availableVoices.find((v) => v.lang.startsWith('es'));
        if (spanishVoice) utterance.voice = spanishVoice;
      } else {
        utterance.lang = 'en-US';
        if (selectedVoiceURI && availableVoices.length > 0) {
          const v = availableVoices.find((x) => x.voiceURI === selectedVoiceURI);
          if (v) utterance.voice = v;
        }
      }
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis warning:', e);
    }
  };

  const handleQuickSubmit = (e) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    const parsed = parseFieldNote(quickInput, projectName);
    if (parsed) {
      setItems((prev) => [parsed, ...prev]);
      setQuickInput('');
    }
  };

  const handleQuickVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice mic is not supported on this browser.');
      return;
    }
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.lang = aiLanguage === 'es' ? 'es-US' : aiLanguage === 'en' ? 'en-US' : navigator.language?.startsWith('es') ? 'es-US' : 'en-US';
    rec.onstart = () => setIsRecording(true);
    rec.onresult = (e) => {
      setQuickInput(e.results[0][0].transcript);
      setIsRecording(false);
    };
    rec.onerror = () => setIsRecording(false);
    rec.onend = () => setIsRecording(false);
    rec.start();
  };

  const handleAiVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice mic is not supported on this browser.');
      return;
    }
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.lang = aiLanguage === 'es' ? 'es-US' : aiLanguage === 'en' ? 'en-US' : navigator.language?.startsWith('es') ? 'es-US' : 'en-US';
    rec.onstart = () => setIsRecording(true);
    rec.onresult = (e) => {
      setAiInput(e.results[0][0].transcript);
      setIsRecording(false);
    };
    rec.onerror = () => setIsRecording(false);
    rec.onend = () => setIsRecording(false);
    rec.start();
  };

  const handleToggleDone = (id) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: i.status === 'completed' ? 'pending' : 'completed' } : i))
    );
  };

  const handleDelete = (id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleSendAiMessage = async (e) => {
    e.preventDefault();
    if (!aiInput.trim() || aiLoading) return;
    const query = aiInput.trim();
    setAiInput('');

    const userMsg = {
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiLoading(true);

    try {
      const lower = query.toLowerCase();
      if (lower.includes('mark') && (lower.includes('done') || lower.includes('complete'))) {
        const match = items.find(
          (i) => i.status === 'pending' && (lower.includes(i.title.toLowerCase()) || (i.subcontractor && lower.includes(i.subcontractor.toLowerCase())))
        );
        if (match) handleToggleDone(match.id);
      } else if (lower.startsWith('add') || lower.startsWith('remind me at') || lower.startsWith('create watchout')) {
        const newItem = parseFieldNote(query, projectName);
        if (newItem) setItems((prev) => [newItem, ...prev]);
      }

      // 1. Google Drive Folder Creation Action
      if (
        (lower.startsWith('create folder') ||
          lower.startsWith('create a folder') ||
          lower.startsWith('create subfolder') ||
          lower.startsWith('create a subfolder') ||
          lower.startsWith('create new folder') ||
          lower.startsWith('create a new folder') ||
          lower.startsWith('make a folder') ||
          lower.startsWith('make folder') ||
          lower.startsWith('add folder') ||
          lower.startsWith('add a folder')) &&
        googleToken &&
        activeProject?.folderId
      ) {
        const folderName = query
          .replace(/^(create|make|add)\s+(a\s+)?(new\s+)?(subfolder|folder)\s+(called|named|for)?\s*/i, '')
          .replace(/^["']|["']$/g, '')
          .trim();
        if (folderName) {
          const created = await createFolder(googleToken, folderName, activeProject.folderId);
          if (created && created.id) {
            const updatedTree = await fetchProjectDriveTree(googleToken, activeProject.folderId);
            if (updatedTree) {
              setDriveTree(updatedTree);
              saveProjectDriveTree(projectId, updatedTree);
            }
            const confirmMsg = `Created the new subfolder **${folderName}** in your ${projectName} Google Drive folder!`;
            const aiMsg = {
              sender: 'ai',
              text: confirmMsg,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setAiMessages((prev) => [...prev, aiMsg]);
            speakText(confirmMsg);
            return;
          }
        }
      }

      // 2. Google Drive Folder Deletion Action
      if (
        (lower.startsWith('delete folder') ||
          lower.startsWith('delete the folder') ||
          lower.startsWith('remove folder') ||
          lower.startsWith('remove the folder') ||
          lower.startsWith('trash folder') ||
          lower.startsWith('trash the folder')) &&
        googleToken &&
        activeProject?.folderId &&
        driveTree?.subfolders
      ) {
        const targetName = query
          .replace(/^(delete|remove|trash)\s+(the\s+)?(subfolder|folder)\s+(called|named)?\s*/i, '')
          .replace(/^["']|["']$/g, '')
          .trim().toLowerCase();

        const match = driveTree.subfolders.find(
          (f) => f.folderName.toLowerCase().includes(targetName) || targetName.includes(f.folderName.toLowerCase())
        );
        if (match && match.folderId) {
          await trashDriveFileOrFolder(googleToken, match.folderId);
          const updatedTree = await fetchProjectDriveTree(googleToken, activeProject.folderId);
          if (updatedTree) {
            setDriveTree(updatedTree);
            saveProjectDriveTree(projectId, updatedTree);
          }
          const confirmMsg = `Deleted the folder **${match.folderName}** from your ${projectName} Google Drive.`;
          const aiMsg = {
            sender: 'ai',
            text: confirmMsg,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          setAiMessages((prev) => [...prev, aiMsg]);
          speakText(confirmMsg);
          return;
        }
      }

      const answer = await askGeminiBrain(query, items, projectName, apiKey, null, projectId, aiMessages, driveTree);
      const aiMsg = {
        sender: 'ai',
        text: answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setAiMessages((prev) => [...prev, aiMsg]);
      speakText(answer);
    } catch (err) {
      console.error('AI chat error:', err);
    } finally {
      setAiLoading(false);
    }
  };

  // Site Setup Protocol Handlers
  const handleSaveEditSetupPreNote = (idx) => {
    if (!editingSetupPreNoteText.trim()) return;
    const updatedNotes = [...siteSetupProtocol.preTradeNotes];
    updatedNotes[idx] = editingSetupPreNoteText.trim();
    const updated = { ...siteSetupProtocol, preTradeNotes: updatedNotes };
    setSiteSetupProtocol(updated);
    saveGlobalSiteSetupProtocol(updated);
    setEditingSetupPreNoteIdx(null);
  };

  const handleDeleteSetupPreNote = (idx, text) => {
    if (!window.confirm(`⚠️ Confirm Deletion:\n\nAre you sure you want to remove this site setup instruction?\n\n"${text}"`)) {
      return;
    }
    const updatedNotes = siteSetupProtocol.preTradeNotes.filter((_, i) => i !== idx);
    const updated = { ...siteSetupProtocol, preTradeNotes: updatedNotes };
    setSiteSetupProtocol(updated);
    saveGlobalSiteSetupProtocol(updated);
  };

  const handleAddSetupPreNote = (e) => {
    e.preventDefault();
    if (!newSetupPreNoteInput.trim()) return;
    const updated = {
      ...siteSetupProtocol,
      preTradeNotes: [...siteSetupProtocol.preTradeNotes, newSetupPreNoteInput.trim()]
    };
    setSiteSetupProtocol(updated);
    saveGlobalSiteSetupProtocol(updated);
    setNewSetupPreNoteInput('');
    setShowAddSetupPreNote(false);
  };

  const handleSaveEditSetupAudit = (id) => {
    if (!editingSetupAuditText.trim()) return;
    const updatedList = siteSetupProtocol.inspectionChecklist.map((item) =>
      item.id === id ? { ...item, text: editingSetupAuditText.trim() } : item
    );
    const updated = { ...siteSetupProtocol, inspectionChecklist: updatedList };
    setSiteSetupProtocol(updated);
    saveGlobalSiteSetupProtocol(updated);
    setEditingSetupAuditId(null);
  };

  const handleDeleteSetupAudit = (id, text) => {
    if (!window.confirm(`⚠️ Confirm Deletion:\n\nAre you sure you want to remove this site setup requirement?\n\n"${text}"`)) {
      return;
    }
    const updatedList = siteSetupProtocol.inspectionChecklist.filter((item) => item.id !== id);
    const updated = { ...siteSetupProtocol, inspectionChecklist: updatedList };
    setSiteSetupProtocol(updated);
    saveGlobalSiteSetupProtocol(updated);
  };

  const handleAddSetupAudit = (e) => {
    e.preventDefault();
    if (!newSetupAuditInput.trim()) return;
    const newItem = {
      id: 'ss_' + Date.now(),
      text: newSetupAuditInput.trim()
    };
    const updated = {
      ...siteSetupProtocol,
      inspectionChecklist: [...siteSetupProtocol.inspectionChecklist, newItem]
    };
    setSiteSetupProtocol(updated);
    saveGlobalSiteSetupProtocol(updated);
    setNewSetupAuditInput('');
    setShowAddSetupAudit(false);
  };

  const handleResetSetupDefaults = () => {
    if (window.confirm('Reset Site Setup protocol back to standard master defaults?')) {
      const defs = resetGlobalSiteSetupProtocol(DEFAULT_SITE_SETUP_PROTOCOL);
      setSiteSetupProtocol(defs);
    }
  };

  const handleFlagUncheckedSetup = () => {
    const unchecked = siteSetupProtocol.inspectionChecklist.filter((i) => !siteSetupChecks[i.id]);
    if (unchecked.length === 0) {
      alert('All Site Setup items are complete! Zero watch-outs created.');
      return;
    }
    const newWatchouts = unchecked.map((item) => ({
      id: 'b_watch_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      rawInput: `Lot Setup: ${item.text}`,
      title: `Site Setup: ${item.text}`,
      category: 'watchout',
      targetDate: null,
      lot: projectName,
      subcontractor: 'Site Prep / Supplier',
      priority: 'high',
      status: 'pending',
      createdAt: new Date().toISOString(),
      notes: `Pending lot mobilization requirement for ${projectName}.`
    }));
    setItems((prev) => [...newWatchouts, ...prev]);
    alert(`Created ${unchecked.length} Site Setup Watch-Outs for ${projectName}!`);
  };

  const handleSMSSiteSetupPreNotes = () => {
    const textBody = `[ADEPEC HOMES SITE SETUP INSTRUCTIONS - ${projectName}]\nTrade: Site Prep & Utilities\n\nRequirements:\n` +
      siteSetupProtocol.preTradeNotes.map((note, idx) => `${idx + 1}. ${note}`).join('\n');
    window.location.href = `sms:?body=${encodeURIComponent(textBody)}`;
  };

  const handleCompleteSiteSetup = () => {
    alert(`🎉 Site Mobilization Complete for ${projectName}! You can now proceed to 1. Plumbing Rough-In.`);
    setActiveSubTab('phases');
    setActivePhaseId('plumbing');
  };

  // Active Stage object
  const currentPhase = phases.find((p) => p.id === activePhaseId) || phases[0];

  const isCheckItemChecked = (phaseId, itemId) => {
    return phaseCheckState[`${phaseId}_${itemId}`] || false;
  };

  const toggleCheckItem = (phaseId, itemId) => {
    const key = `${phaseId}_${itemId}`;
    setPhaseCheckState((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSMSPreNotes = (tradeName = currentPhase.trade, notesList = currentPhase.preTradeNotes) => {
    const textBody = `[ADEPEC HOMES PRE-WORK SPECS - ${projectName}]\nTrade: ${tradeName}\nPhase: ${currentPhase.name}\n\nPre-Work Requirements:\n` +
      notesList.map((note, idx) => `${idx + 1}. ${note}`).join('\n');
    window.location.href = `sms:?body=${encodeURIComponent(textBody)}`;
  };

  // Pre-Work Notes Editing
  const handleSaveEditPreNote = (subId, idx) => {
    if (!editingPreNoteText.trim()) return;
    const updatedPhases = phases.map((p) => {
      if (p.id === currentPhase.id) {
        if (p.hasSubcategories && subId) {
          const updatedSubs = p.subcategories.map((sub) => {
            if (sub.id === subId) {
              const updatedNotes = [...sub.preTradeNotes];
              updatedNotes[idx] = editingPreNoteText.trim();
              return { ...sub, preTradeNotes: updatedNotes };
            }
            return sub;
          });
          return { ...p, subcategories: updatedSubs };
        } else {
          const updatedNotes = [...p.preTradeNotes];
          updatedNotes[idx] = editingPreNoteText.trim();
          return { ...p, preTradeNotes: updatedNotes };
        }
      }
      return p;
    });
    setPhases(updatedPhases);
    saveGlobalPhases(updatedPhases);
    setEditingPreNoteKey(null);
  };

  const handleDeletePreNote = (subId, idx, text) => {
    if (!window.confirm(`⚠️ Confirm Deletion:\n\nAre you sure you want to remove this pre-work requirement?\n\n"${text}"`)) {
      return;
    }
    const updatedPhases = phases.map((p) => {
      if (p.id === currentPhase.id) {
        if (p.hasSubcategories && subId) {
          const updatedSubs = p.subcategories.map((sub) => {
            if (sub.id === subId) {
              return { ...sub, preTradeNotes: sub.preTradeNotes.filter((_, i) => i !== idx) };
            }
            return sub;
          });
          return { ...p, subcategories: updatedSubs };
        } else {
          return { ...p, preTradeNotes: p.preTradeNotes.filter((_, i) => i !== idx) };
        }
      }
      return p;
    });
    setPhases(updatedPhases);
    saveGlobalPhases(updatedPhases);
  };

  const handleAddPreNote = (subId, e) => {
    e.preventDefault();
    if (!newPreNoteInput.trim()) return;
    const updatedPhases = phases.map((p) => {
      if (p.id === currentPhase.id) {
        if (p.hasSubcategories && subId) {
          const updatedSubs = p.subcategories.map((sub) => {
            if (sub.id === subId) {
              return { ...sub, preTradeNotes: [...sub.preTradeNotes, newPreNoteInput.trim()] };
            }
            return sub;
          });
          return { ...p, subcategories: updatedSubs };
        } else {
          return { ...p, preTradeNotes: [...p.preTradeNotes, newPreNoteInput.trim()] };
        }
      }
      return p;
    });
    setPhases(updatedPhases);
    saveGlobalPhases(updatedPhases);
    setNewPreNoteInput('');
    setAddingPreNoteSubId(null);
  };

  // Audit Checklist Editing
  const handleSaveEditAudit = (subId, id) => {
    if (!editingAuditText.trim()) return;
    const updatedPhases = phases.map((p) => {
      if (p.id === currentPhase.id) {
        if (p.hasSubcategories && subId) {
          const updatedSubs = p.subcategories.map((sub) => {
            if (sub.id === subId) {
              const updatedList = sub.inspectionChecklist.map((item) =>
                item.id === id ? { ...item, text: editingAuditText.trim() } : item
              );
              return { ...sub, inspectionChecklist: updatedList };
            }
            return sub;
          });
          return { ...p, subcategories: updatedSubs };
        } else {
          const updatedList = p.inspectionChecklist.map((item) =>
            item.id === id ? { ...item, text: editingAuditText.trim() } : item
          );
          return { ...p, inspectionChecklist: updatedList };
        }
      }
      return p;
    });
    setPhases(updatedPhases);
    saveGlobalPhases(updatedPhases);
    setEditingAuditId(null);
  };

  const handleDeleteAudit = (subId, id, text) => {
    if (!window.confirm(`⚠️ Confirm Deletion:\n\nAre you sure you want to delete this checklist item?\n\n"${text}"`)) {
      return;
    }
    const updatedPhases = phases.map((p) => {
      if (p.id === currentPhase.id) {
        if (p.hasSubcategories && subId) {
          const updatedSubs = p.subcategories.map((sub) => {
            if (sub.id === subId) {
              return { ...sub, inspectionChecklist: sub.inspectionChecklist.filter((item) => item.id !== id) };
            }
            return sub;
          });
          return { ...p, subcategories: updatedSubs };
        } else {
          return { ...p, inspectionChecklist: p.inspectionChecklist.filter((item) => item.id !== id) };
        }
      }
      return p;
    });
    setPhases(updatedPhases);
    saveGlobalPhases(updatedPhases);
  };

  const handleAddAudit = (subId, e) => {
    e.preventDefault();
    if (!newAuditInput.trim()) return;
    const newItem = {
      id: 'custom_' + Date.now(),
      text: newAuditInput.trim()
    };
    const updatedPhases = phases.map((p) => {
      if (p.id === currentPhase.id) {
        if (p.hasSubcategories && subId) {
          const updatedSubs = p.subcategories.map((sub) => {
            if (sub.id === subId) {
              return { ...sub, inspectionChecklist: [...sub.inspectionChecklist, newItem] };
            }
            return sub;
          });
          return { ...p, subcategories: updatedSubs };
        } else {
          return { ...p, inspectionChecklist: [...p.inspectionChecklist, newItem] };
        }
      }
      return p;
    });
    setPhases(updatedPhases);
    saveGlobalPhases(updatedPhases);
    setNewAuditInput('');
    setAddingAuditSubId(null);
  };

  const handleRestoreCurrentPhaseNotes = () => {
    const defaultPhase = DEFAULT_CONSTRUCTION_PHASES.find((p) => p.id === currentPhase.id);
    if (!defaultPhase) return;

    const updatedPhases = phases.map((p) => {
      if (p.id === currentPhase.id) {
        if (p.hasSubcategories) {
          return { ...p, subcategories: defaultPhase.subcategories };
        } else {
          return { ...p, preTradeNotes: [...defaultPhase.preTradeNotes] };
        }
      }
      return p;
    });

    setPhases(updatedPhases);
    saveGlobalPhases(updatedPhases);
  };

  const handleResetToDefaults = () => {
    if (window.confirm('Reset all 6 inspection stage protocols back to master defaults? All standard notes and checklist items will be reloaded.')) {
      const defs = resetGlobalPhases(DEFAULT_CONSTRUCTION_PHASES);
      setPhases(defs);
      alert('Restored master standard templates successfully!');
    }
  };

  const handleFlagUncheckedWatchouts = () => {
    let unchecked = [];
    if (currentPhase.hasSubcategories) {
      currentPhase.subcategories.forEach((sub) => {
        const subUnchecked = sub.inspectionChecklist.filter(
          (i) => !isCheckItemChecked(currentPhase.id, i.id)
        );
        subUnchecked.forEach((item) => {
          unchecked.push({ item, trade: sub.trade });
        });
      });
    } else {
      const simpleUnchecked = currentPhase.inspectionChecklist.filter(
        (i) => !isCheckItemChecked(currentPhase.id, i.id)
      );
      unchecked = simpleUnchecked.map((item) => ({ item, trade: currentPhase.trade }));
    }

    if (unchecked.length === 0) {
      alert('All items in this inspection checklist are marked PASSED! Zero watch-outs created.');
      return;
    }
    const newWatchouts = unchecked.map(({ item, trade }) => ({
      id: 'b_watch_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      rawInput: `Pre-Inspection Check: ${item.text}`,
      title: `Pre-Inspection: ${item.text}`,
      category: 'watchout',
      targetDate: null,
      lot: projectName,
      subcontractor: trade,
      priority: 'high',
      status: 'pending',
      createdAt: new Date().toISOString(),
      notes: `Flagged during ${currentPhase.name} readiness check for ${projectName}.`
    }));
    setItems((prev) => [...newWatchouts, ...prev]);
    alert(`Created ${unchecked.length} High-Priority Watch-Outs for ${projectName}! Check the Watch-Outs tab.`);
  };

  const handleScheduleInspection = () => {
    const title = `Schedule City Inspection: ${currentPhase.name} (${projectName})`;
    const targetDate = new Date(Date.now() + 86400000);
    const newRem = {
      id: 'b_rem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      rawInput: title,
      title: title,
      category: 'reminder',
      targetDate: targetDate.toISOString(),
      lot: projectName,
      subcontractor: 'City Inspector',
      priority: 'high',
      status: 'pending',
      createdAt: new Date().toISOString(),
      notes: `Pre-inspection checklist passed for ${currentPhase.name}. Ready to schedule inspector visit.`
    };
    setItems((prev) => [newRem, ...prev]);
    alert(`Inspection reminder logged for ${projectName}! Added to Reminders tab.`);
  };

  const pendingWatchouts = items.filter((i) => i.category === 'watchout' && i.status === 'pending');
  const pendingSubs = items.filter((i) => i.category === 'subcontractor' && i.status === 'pending');
  const pendingReminders = items.filter((i) => i.category === 'reminder' && i.status === 'pending');

  const siteSetupCompletedCount = siteSetupProtocol.inspectionChecklist.filter((i) => siteSetupChecks[i.id]).length;

  const filteredItems = items.filter((item) => {
    if (activeSubTab === 'watchout') return item.category === 'watchout';
    if (activeSubTab === 'subcontractor') return item.category === 'subcontractor';
    if (activeSubTab === 'reminder') return item.category === 'reminder';
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          backgroundColor: 'var(--color-zinc-900)',
          borderRadius: '10px',
          border: '1px solid var(--color-zinc-800)',
          borderLeft: '4px solid var(--color-amber-500)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'rgba(197, 160, 89, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-amber-500)'
            }}
          >
            <Zap size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-zinc-100)', margin: 0 }}>
              Field Brain — {projectName}
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-zinc-400)', margin: '2px 0 0 0' }}>
              Voice capture, site setup, phase prep & AI assistant
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsAssistantOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            backgroundColor: 'var(--color-amber-500)',
            color: '#000',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 800,
            fontSize: '0.82rem',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(197, 160, 89, 0.3)'
          }}
        >
          <Bot size={16} />
          <span>Ask AI</span>
        </button>
      </div>

      {/* Quick Voice / Text Capture Input */}
      <div
        style={{
          backgroundColor: 'var(--color-zinc-900)',
          borderRadius: '10px',
          border: '1px solid var(--color-zinc-800)',
          padding: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--color-amber-500)', textTransform: 'uppercase' }}>
            ⚡ Field Quick Capture
          </span>
          <button
            type="button"
            onClick={handleQuickVoice}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              backgroundColor: isRecording ? 'rgba(239, 68, 68, 0.2)' : 'rgba(197, 160, 89, 0.15)',
              border: '1px solid ' + (isRecording ? '#ef4444' : 'var(--color-amber-500)'),
              color: isRecording ? '#ef4444' : 'var(--color-amber-500)',
              borderRadius: '20px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <Mic size={13} />
            {isRecording ? 'Listening...' : 'Tap & Speak'}
          </button>
        </div>

        <form onSubmit={handleQuickSubmit} style={{ display: 'flex', gap: '8px' }}>
          <textarea
            placeholder='Type or speak: "Remind me at 3 PM to call electrician about rough-in"...'
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleQuickSubmit(e);
              }
            }}
            style={{
              flex: 1,
              backgroundColor: 'var(--color-zinc-950)',
              border: '1px solid var(--color-zinc-800)',
              borderRadius: '8px',
              padding: '10px 12px',
              color: 'var(--color-zinc-100)',
              fontSize: '0.9rem',
              fontFamily: 'inherit',
              resize: 'none',
              minHeight: '48px',
              outline: 'none'
            }}
          />
          <button
            type="submit"
            style={{
              padding: '0 16px',
              backgroundColor: 'var(--color-amber-500)',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Send size={15} /> Save
          </button>
        </form>
      </div>

      {/* 2-LINE SUB-TAB NAVIGATION */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {/* LINE 1: All | Site Setup | Phase Prep & Inspection */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            backgroundColor: 'var(--color-zinc-900)',
            padding: '4px',
            borderRadius: '8px',
            border: '1px solid var(--color-zinc-800)'
          }}
        >
          <button
            onClick={() => setActiveSubTab('all')}
            style={{
              flex: 1,
              padding: '8px 6px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: activeSubTab === 'all' ? 'var(--color-amber-500)' : 'transparent',
              color: activeSubTab === 'all' ? '#000' : 'var(--color-zinc-400)',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            All ({items.length})
          </button>

          <button
            onClick={() => setActiveSubTab('site_setup')}
            style={{
              flex: 1.2,
              padding: '8px 6px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: activeSubTab === 'site_setup' ? 'var(--color-amber-500)' : 'transparent',
              color: activeSubTab === 'site_setup' ? '#000' : 'var(--color-zinc-400)',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              whiteSpace: 'nowrap'
            }}
          >
            <Flag size={13} />
            <span>Site Setup ({siteSetupCompletedCount}/{siteSetupProtocol.inspectionChecklist.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('phases')}
            style={{
              flex: 1.5,
              padding: '8px 8px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: activeSubTab === 'phases' ? 'var(--color-amber-500)' : 'transparent',
              color: activeSubTab === 'phases' ? '#000' : 'var(--color-zinc-400)',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              whiteSpace: 'nowrap'
            }}
          >
            <CheckSquare size={13} />
            <span>Phase Prep & Inspection</span>
          </button>
        </div>

        {/* LINE 2: Watch-Outs | Trade Calls | Reminders */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            backgroundColor: 'var(--color-zinc-900)',
            padding: '4px',
            borderRadius: '8px',
            border: '1px solid var(--color-zinc-800)'
          }}
        >
          <button
            onClick={() => setActiveSubTab('watchout')}
            style={{
              flex: 1,
              padding: '8px 6px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: activeSubTab === 'watchout' ? 'var(--color-amber-500)' : 'transparent',
              color: activeSubTab === 'watchout' ? '#000' : 'var(--color-zinc-400)',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Watch-Outs ({pendingWatchouts.length})
          </button>
          <button
            onClick={() => setActiveSubTab('subcontractor')}
            style={{
              flex: 1,
              padding: '8px 6px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: activeSubTab === 'subcontractor' ? 'var(--color-amber-500)' : 'transparent',
              color: activeSubTab === 'subcontractor' ? '#000' : 'var(--color-zinc-400)',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Trade Calls ({pendingSubs.length})
          </button>
          <button
            onClick={() => setActiveSubTab('reminder')}
            style={{
              flex: 1,
              padding: '8px 6px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: activeSubTab === 'reminder' ? 'var(--color-amber-500)' : 'transparent',
              color: activeSubTab === 'reminder' ? '#000' : 'var(--color-zinc-400)',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Reminders ({pendingReminders.length})
          </button>
        </div>
      </div>

      {/* DEDICATED SITE SETUP TAB VIEW (Exact same design as Inspection Sections) */}
      {activeSubTab === 'site_setup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Main Card */}
          <div
            style={{
              backgroundColor: 'var(--color-zinc-900)',
              border: '1px solid var(--color-zinc-800)',
              borderLeft: '4px solid var(--color-amber-500)',
              borderRadius: '10px',
              padding: '16px'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(197, 160, 89, 0.15)',
                    color: 'var(--color-amber-500)',
                    fontSize: '0.72rem',
                    fontWeight: 800
                  }}
                >
                  {projectName}
                </span>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    fontSize: '0.72rem',
                    fontWeight: 700
                  }}
                >
                  Site Prep & Utilities
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setIsCustomizingSetup(!isCustomizingSetup)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    backgroundColor: isCustomizingSetup ? 'var(--color-amber-500)' : 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid ' + (isCustomizingSetup ? 'var(--color-amber-500)' : 'var(--color-zinc-700)'),
                    color: isCustomizingSetup ? '#000' : 'var(--color-zinc-300)',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s'
                  }}
                  title={isCustomizingSetup ? 'Finish customizing' : 'Add, edit, or remove lines'}
                >
                  {isCustomizingSetup ? <Check size={12} /> : <Settings size={12} />}
                  <span>{isCustomizingSetup ? 'Done Customizing' : 'Customize Protocol'}</span>
                </button>
                {isCustomizingSetup && (
                  <button
                    onClick={handleResetSetupDefaults}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-zinc-500)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Reset to Master Defaults"
                  >
                    <RotateCcw size={12} /> Reset Defaults
                  </button>
                )}
                <span style={{ fontSize: '1.3rem' }}>🚩</span>
              </div>
            </div>

            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-zinc-100)', margin: '0 0 14px 0' }}>
              Site Setup & Lot Mobilization Protocol
            </h3>

            {/* SECTION 1: TELL SUB / SUPPLIERS BEFORE WORK STARTS */}
            <div
              style={{
                backgroundColor: 'var(--color-zinc-950)',
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid var(--color-zinc-800)',
                marginBottom: '14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-amber-500)', textTransform: 'uppercase' }}>
                  1. TELL SUPPLIERS / SUBS BEFORE WORK STARTS ({siteSetupProtocol.preTradeNotes.length})
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {isCustomizingSetup && (
                    <button
                      onClick={() => setShowAddSetupPreNote(!showAddSetupPreNote)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid var(--color-zinc-700)',
                        color: 'var(--color-zinc-200)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}
                    >
                      <Plus size={12} /> Add Line
                    </button>
                  )}
                  <button
                    onClick={handleSMSSiteSetupPreNotes}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(197, 160, 89, 0.15)',
                      border: '1px solid var(--color-amber-500)',
                      color: 'var(--color-amber-500)',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <MessageSquare size={12} /> Text Specs (SMS)
                  </button>
                </div>
              </div>

              {/* Add Pre-Note Form */}
              {isCustomizingSetup && showAddSetupPreNote && (
                <form onSubmit={handleAddSetupPreNote} style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="Enter new site setup pre-work instruction..."
                    value={newSetupPreNoteInput}
                    onChange={(e) => setNewSetupPreNoteInput(e.target.value)}
                    autoFocus
                    style={{
                      flex: 1,
                      backgroundColor: 'var(--color-zinc-900)',
                      border: '1px solid var(--color-amber-500)',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      color: 'var(--color-zinc-100)',
                      fontSize: '0.82rem',
                      outline: 'none'
                    }}
                  />
                  <button type="submit" style={{ padding: '0 12px', backgroundColor: 'var(--color-amber-500)', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>
                    Add
                  </button>
                  <button type="button" onClick={() => setShowAddSetupPreNote(false)} style={{ padding: '0 8px', backgroundColor: 'transparent', color: 'var(--color-zinc-400)', border: 'none', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </form>
              )}

              {/* Pre-Note Bullets */}
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px', margin: 0, padding: 0 }}>
                {siteSetupProtocol.preTradeNotes.map((note, idx) => {
                  const isEditing = editingSetupPreNoteIdx === idx;
                  return (
                    <li
                      key={idx}
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--color-zinc-200)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        padding: '4px 6px',
                        borderRadius: '4px',
                        backgroundColor: isEditing ? 'var(--color-zinc-900)' : 'transparent'
                      }}
                    >
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                          <input
                            type="text"
                            value={editingSetupPreNoteText}
                            onChange={(e) => setEditingSetupPreNoteText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEditSetupPreNote(idx);
                              if (e.key === 'Escape') setEditingSetupPreNoteIdx(null);
                            }}
                            autoFocus
                            style={{ flex: 1, backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-amber-500)', borderRadius: '4px', padding: '4px 8px', color: 'var(--color-zinc-100)', fontSize: '0.82rem', outline: 'none' }}
                          />
                          <button onClick={() => handleSaveEditSetupPreNote(idx)} style={{ background: 'var(--color-amber-500)', color: '#000', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}>
                            <Check size={14} />
                          </button>
                          <button onClick={() => setEditingSetupPreNoteIdx(null)} style={{ background: 'none', color: 'var(--color-zinc-400)', border: 'none', cursor: 'pointer' }}>
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', flex: 1 }}>
                            <span style={{ color: 'var(--color-amber-500)', fontWeight: 800 }}>•</span>
                            <span>{note}</span>
                          </div>
                          {isCustomizingSetup && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.9 }}>
                              <button
                                onClick={() => {
                                  setEditingSetupPreNoteIdx(idx);
                                  setEditingSetupPreNoteText(note);
                                }}
                                style={{ background: 'none', border: 'none', color: 'var(--color-zinc-400)', cursor: 'pointer', padding: '2px' }}
                                title="Edit line"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteSetupPreNote(idx, note)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                                title="Delete line"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* SECTION 2: SITE MOBILIZATION READINESS AUDIT */}
            <div
              style={{
                backgroundColor: 'var(--color-zinc-950)',
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid var(--color-zinc-800)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#34d399', textTransform: 'uppercase' }}>
                  2. SITE MOBILIZATION READINESS AUDIT ({siteSetupProtocol.inspectionChecklist.length})
                </span>
                {isCustomizingSetup && (
                  <button
                    onClick={() => setShowAddSetupAudit(!showAddSetupAudit)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid var(--color-zinc-700)',
                      color: 'var(--color-zinc-200)',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                  >
                    <Plus size={12} /> Add Item
                  </button>
                )}
              </div>

              {/* Add Audit Item Form */}
              {isCustomizingSetup && showAddSetupAudit && (
                <form onSubmit={handleAddSetupAudit} style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="Enter new site setup checklist item..."
                    value={newSetupAuditInput}
                    onChange={(e) => setNewSetupAuditInput(e.target.value)}
                    autoFocus
                    style={{ flex: 1, backgroundColor: 'var(--color-zinc-900)', border: '1px solid #34d399', borderRadius: '6px', padding: '6px 10px', color: 'var(--color-zinc-100)', fontSize: '0.82rem', outline: 'none' }}
                  />
                  <button type="submit" style={{ padding: '0 12px', backgroundColor: '#10b981', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>
                    Add
                  </button>
                  <button type="button" onClick={() => setShowAddSetupAudit(false)} style={{ background: 'none', color: 'var(--color-zinc-400)', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>
                    Cancel
                  </button>
                </form>
              )}

              {/* Checklist Items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                {siteSetupProtocol.inspectionChecklist.map((chk) => {
                  const isChecked = siteSetupChecks[chk.id] || false;
                  const isEditing = editingSetupAuditId === chk.id;

                  return (
                    <div
                      key={chk.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        backgroundColor: isChecked ? 'rgba(16, 185, 129, 0.12)' : 'var(--color-zinc-900)',
                        border: '1px solid ' + (isChecked ? 'rgba(16, 185, 129, 0.3)' : 'var(--color-zinc-800)'),
                        transition: 'all 0.15s'
                      }}
                    >
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                          <input
                            type="text"
                            value={editingSetupAuditText}
                            onChange={(e) => setEditingSetupAuditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEditSetupAudit(chk.id);
                              if (e.key === 'Escape') setEditingSetupAuditId(null);
                            }}
                            autoFocus
                            style={{ flex: 1, backgroundColor: 'var(--color-zinc-950)', border: '1px solid #34d399', borderRadius: '4px', padding: '4px 8px', color: 'var(--color-zinc-100)', fontSize: '0.82rem', outline: 'none' }}
                          />
                          <button onClick={() => handleSaveEditSetupAudit(chk.id)} style={{ background: '#10b981', color: '#000', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}>
                            <Check size={14} />
                          </button>
                          <button onClick={() => setEditingSetupAuditId(null)} style={{ background: 'none', color: 'var(--color-zinc-400)', border: 'none', cursor: 'pointer' }}>
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div
                            onClick={() => toggleSiteSetupCheck(chk.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer' }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              style={{ width: '16px', height: '16px', accentColor: '#10b981', cursor: 'pointer' }}
                            />
                            <span
                              style={{
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                color: isChecked ? '#34d399' : 'var(--color-zinc-200)',
                                textDecoration: isChecked ? 'line-through' : 'none'
                              }}
                            >
                              {chk.text}
                            </span>
                          </div>

                          {isCustomizingSetup && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.9 }}>
                              <button
                                onClick={() => {
                                  setEditingSetupAuditId(chk.id);
                                  setEditingSetupAuditText(chk.text);
                                }}
                                style={{ background: 'none', border: 'none', color: 'var(--color-zinc-400)', cursor: 'pointer', padding: '2px' }}
                                title="Edit item"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteSetupAudit(chk.id, chk.text)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                                title="Delete item"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                <button
                  onClick={handleFlagUncheckedSetup}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid #ef4444',
                    color: '#ef4444',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px'
                  }}
                >
                  <AlertTriangle size={14} /> Flag Unchecked as Watch-Outs
                </button>
                <button
                  onClick={handleCompleteSiteSetup}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--color-amber-500)',
                    border: 'none',
                    color: '#000',
                    fontWeight: 800,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px'
                  }}
                >
                  <CheckSquare size={14} /> Site Ready — Proceed to Plumbing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE PREP & INSPECTION VIEW */}
      {activeSubTab === 'phases' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* The 6 Municipal Stage Selector Pills */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '8px'
            }}
          >
            {phases.map((p) => {
              const isActive = activePhaseId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setActivePhaseId(p.id)}
                  style={{
                    padding: '9px 10px',
                    borderRadius: '8px',
                    border: '1px solid ' + (isActive ? 'var(--color-amber-500)' : 'var(--color-zinc-800)'),
                    backgroundColor: isActive ? 'rgba(197, 160, 89, 0.15)' : 'var(--color-zinc-900)',
                    color: isActive ? 'var(--color-amber-500)' : 'var(--color-zinc-300)',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span style={{ fontSize: '1rem', flexShrink: 0 }}>{p.icon}</span>
                  <span>{p.shortName || p.name}</span>
                </button>
              );
            })}
          </div>

          {/* Phase Card */}
          <div
            style={{
              backgroundColor: 'var(--color-zinc-900)',
              border: '1px solid var(--color-zinc-800)',
              borderLeft: '4px solid var(--color-amber-500)',
              borderRadius: '10px',
              padding: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(197, 160, 89, 0.15)',
                    color: 'var(--color-amber-500)',
                    fontSize: '0.72rem',
                    fontWeight: 800
                  }}
                >
                  {projectName}
                </span>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    fontSize: '0.72rem',
                    fontWeight: 700
                  }}
                >
                  {currentPhase.trade}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setIsCustomizing(!isCustomizing)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    backgroundColor: isCustomizing ? 'var(--color-amber-500)' : 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid ' + (isCustomizing ? 'var(--color-amber-500)' : 'var(--color-zinc-700)'),
                    color: isCustomizing ? '#000' : 'var(--color-zinc-300)',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s'
                  }}
                  title={isCustomizing ? 'Finish customizing' : 'Add, edit, or remove lines'}
                >
                  {isCustomizing ? <Check size={12} /> : <Settings size={12} />}
                  <span>{isCustomizing ? 'Done Customizing' : 'Customize Protocol'}</span>
                </button>
                {isCustomizing && (
                  <button
                    onClick={handleResetToDefaults}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-zinc-500)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Reset to Master Defaults"
                  >
                    <RotateCcw size={12} /> Reset Defaults
                  </button>
                )}
                <span style={{ fontSize: '1.3rem' }}>{currentPhase.icon}</span>
              </div>
            </div>

            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-zinc-100)', margin: '0 0 14px 0' }}>
              {currentPhase.name} Protocol
            </h3>

            {/* SECTION 1: TELL SUB BEFORE WORK STARTS */}
            <div
              style={{
                backgroundColor: 'var(--color-zinc-950)',
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid var(--color-zinc-800)',
                marginBottom: '14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-amber-500)', textTransform: 'uppercase' }}>
                  1. Tell Sub BEFORE Work Starts
                </span>
                {!currentPhase.hasSubcategories && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isCustomizing && (
                      <button
                        onClick={() => setAddingPreNoteSubId(addingPreNoteSubId ? null : 'single')}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid var(--color-zinc-700)',
                          color: 'var(--color-zinc-200)',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        <Plus size={12} /> Add Line
                      </button>
                    )}
                    <button
                      onClick={() => handleSMSPreNotes()}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(197, 160, 89, 0.15)',
                        border: '1px solid var(--color-amber-500)',
                        color: 'var(--color-amber-500)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <MessageSquare size={12} /> Text Sub (SMS)
                    </button>
                  </div>
                )}
              </div>

              {/* Single Phase Pre-Notes */}
              {!currentPhase.hasSubcategories && (
                <>
                  {isCustomizing && addingPreNoteSubId === 'single' && (
                    <form onSubmit={(e) => handleAddPreNote(null, e)} style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                      <input
                        type="text"
                        placeholder="Enter new pre-work trade requirement..."
                        value={newPreNoteInput}
                        onChange={(e) => setNewPreNoteInput(e.target.value)}
                        autoFocus
                        style={{
                          flex: 1,
                          backgroundColor: 'var(--color-zinc-900)',
                          border: '1px solid var(--color-amber-500)',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          color: 'var(--color-zinc-100)',
                          fontSize: '0.82rem',
                          outline: 'none'
                        }}
                      />
                      <button type="submit" style={{ padding: '0 12px', backgroundColor: 'var(--color-amber-500)', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>
                        Add
                      </button>
                      <button type="button" onClick={() => setAddingPreNoteSubId(null)} style={{ padding: '0 8px', backgroundColor: 'transparent', color: 'var(--color-zinc-400)', border: 'none', cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </form>
                  )}

                  {currentPhase.preTradeNotes.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '6px', backgroundColor: 'var(--color-zinc-900)', border: '1px dashed var(--color-zinc-700)' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-zinc-400)' }}>No pre-trade notes listed for this phase.</span>
                      <button
                        onClick={handleRestoreCurrentPhaseNotes}
                        style={{ padding: '4px 10px', backgroundColor: 'var(--color-amber-500)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <RotateCcw size={12} /> Reload Standard Notes
                      </button>
                    </div>
                  ) : (
                    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px', margin: 0, padding: 0 }}>
                      {currentPhase.preTradeNotes.map((note, idx) => {
                        const isEditing = editingPreNoteKey === `single_${idx}`;
                        return (
                          <li
                            key={idx}
                          style={{
                            fontSize: '0.85rem',
                            color: 'var(--color-zinc-200)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            padding: '4px 6px',
                            borderRadius: '4px',
                            backgroundColor: isEditing ? 'var(--color-zinc-900)' : 'transparent'
                          }}
                        >
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                              <input
                                type="text"
                                value={editingPreNoteText}
                                onChange={(e) => setEditingPreNoteText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEditPreNote(null, idx);
                                  if (e.key === 'Escape') setEditingPreNoteKey(null);
                                }}
                                autoFocus
                                style={{ flex: 1, backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-amber-500)', borderRadius: '4px', padding: '4px 8px', color: 'var(--color-zinc-100)', fontSize: '0.82rem', outline: 'none' }}
                              />
                              <button onClick={() => handleSaveEditPreNote(null, idx)} style={{ background: 'var(--color-amber-500)', color: '#000', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}>
                                <Check size={14} />
                              </button>
                              <button onClick={() => setEditingPreNoteKey(null)} style={{ background: 'none', color: 'var(--color-zinc-400)', border: 'none', cursor: 'pointer' }}>
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', flex: 1 }}>
                                <span style={{ color: 'var(--color-amber-500)', fontWeight: 800 }}>•</span>
                                <span>{note}</span>
                              </div>
                              {isCustomizing && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.9 }}>
                                  <button
                                    onClick={() => {
                                      setEditingPreNoteKey(`single_${idx}`);
                                      setEditingPreNoteText(note);
                                    }}
                                    style={{ background: 'none', border: 'none', color: 'var(--color-zinc-400)', cursor: 'pointer', padding: '2px' }}
                                    title="Edit line"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleDeletePreNote(null, idx, note)}
                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                                    title="Delete line"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}

              {/* Combined 5-Trade Pre-Notes for Framing Combo */}
              {currentPhase.hasSubcategories && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {currentPhase.subcategories.map((sub) => (
                    <div
                      key={sub.id}
                      style={{
                        backgroundColor: 'var(--color-zinc-900)',
                        border: '1px solid var(--color-zinc-800)',
                        borderRadius: '6px',
                        padding: '10px 12px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '1rem' }}>{sub.icon}</span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-zinc-200)' }}>
                            {sub.name} ({sub.trade})
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {isCustomizing && (
                            <button
                              onClick={() => setAddingPreNoteSubId(addingPreNoteSubId === sub.id ? null : sub.id)}
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                                border: '1px solid var(--color-zinc-700)',
                                color: 'var(--color-zinc-300)',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '2px'
                              }}
                            >
                              <Plus size={11} /> Add Line
                            </button>
                          )}
                          <button
                            onClick={() => handleSMSPreNotes(sub.trade, sub.preTradeNotes)}
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(197, 160, 89, 0.12)',
                              border: '1px solid var(--color-amber-500)',
                              color: 'var(--color-amber-500)',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}
                          >
                            <MessageSquare size={11} /> Text {sub.trade}
                          </button>
                        </div>
                      </div>

                      {/* Add Pre-Note under this trade */}
                      {isCustomizing && addingPreNoteSubId === sub.id && (
                        <form onSubmit={(e) => handleAddPreNote(sub.id, e)} style={{ display: 'flex', gap: '6px', marginBottom: '8px', marginTop: '6px' }}>
                          <input
                            type="text"
                            placeholder={`New note for ${sub.trade}...`}
                            value={newPreNoteInput}
                            onChange={(e) => setNewPreNoteInput(e.target.value)}
                            autoFocus
                            style={{ flex: 1, backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-amber-500)', borderRadius: '4px', padding: '5px 8px', color: 'var(--color-zinc-100)', fontSize: '0.8rem', outline: 'none' }}
                          />
                          <button type="submit" style={{ padding: '0 10px', backgroundColor: 'var(--color-amber-500)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer' }}>
                            Add
                          </button>
                          <button type="button" onClick={() => setAddingPreNoteSubId(null)} style={{ background: 'none', color: 'var(--color-zinc-400)', border: 'none', cursor: 'pointer', fontSize: '0.72rem' }}>
                            Cancel
                          </button>
                        </form>
                      )}

                      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px', margin: 0, padding: 0 }}>
                        {sub.preTradeNotes.map((note, idx) => {
                          const isEditing = editingPreNoteKey === `${sub.id}_${idx}`;
                          return (
                            <li
                              key={idx}
                              style={{
                                fontSize: '0.82rem',
                                color: 'var(--color-zinc-300)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '6px',
                                padding: '3px 4px',
                                borderRadius: '4px',
                                backgroundColor: isEditing ? 'var(--color-zinc-950)' : 'transparent'
                              }}
                            >
                              {isEditing ? (
                                <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
                                  <input
                                    type="text"
                                    value={editingPreNoteText}
                                    onChange={(e) => setEditingPreNoteText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveEditPreNote(sub.id, idx);
                                      if (e.key === 'Escape') setEditingPreNoteKey(null);
                                    }}
                                    autoFocus
                                    style={{ flex: 1, backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-amber-500)', borderRadius: '4px', padding: '3px 6px', color: 'var(--color-zinc-100)', fontSize: '0.8rem', outline: 'none' }}
                                  />
                                  <button onClick={() => handleSaveEditPreNote(sub.id, idx)} style={{ background: 'var(--color-amber-500)', color: '#000', border: 'none', borderRadius: '4px', padding: '3px 6px', cursor: 'pointer' }}>
                                    <Check size={12} />
                                  </button>
                                  <button onClick={() => setEditingPreNoteKey(null)} style={{ background: 'none', color: 'var(--color-zinc-400)', border: 'none', cursor: 'pointer' }}>
                                    <X size={12} />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', flex: 1 }}>
                                    <span style={{ color: 'var(--color-amber-500)', fontWeight: 800 }}>•</span>
                                    <span>{note}</span>
                                  </div>
                                  {isCustomizing && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.9 }}>
                                      <button onClick={() => { setEditingPreNoteKey(`${sub.id}_${idx}`); setEditingPreNoteText(note); }} style={{ background: 'none', border: 'none', color: 'var(--color-zinc-400)', cursor: 'pointer', padding: '2px' }} title="Edit line">
                                        <Edit2 size={12} />
                                      </button>
                                      <button onClick={() => handleDeletePreNote(sub.id, idx, note)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }} title="Delete line">
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SECTION 2: PRE-INSPECTION READINESS AUDIT */}
            <div
              style={{
                backgroundColor: 'var(--color-zinc-950)',
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid var(--color-zinc-800)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#34d399', textTransform: 'uppercase' }}>
                  2. Pre-Inspection Readiness Audit (Before Calling Inspector)
                </span>
                {!currentPhase.hasSubcategories && isCustomizing && (
                  <button
                    onClick={() => setAddingAuditSubId(addingAuditSubId ? null : 'single')}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid var(--color-zinc-700)',
                      color: 'var(--color-zinc-200)',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                  >
                    <Plus size={12} /> Add Item
                  </button>
                )}
              </div>

              {/* Single Phase Checklist */}
              {!currentPhase.hasSubcategories && (
                <>
                  {isCustomizing && addingAuditSubId === 'single' && (
                    <form onSubmit={(e) => handleAddAudit(null, e)} style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                      <input
                        type="text"
                        placeholder="Enter new pre-inspection check item..."
                        value={newAuditInput}
                        onChange={(e) => setNewAuditInput(e.target.value)}
                        autoFocus
                        style={{ flex: 1, backgroundColor: 'var(--color-zinc-900)', border: '1px solid #34d399', borderRadius: '6px', padding: '6px 10px', color: 'var(--color-zinc-100)', fontSize: '0.82rem', outline: 'none' }}
                      />
                      <button type="submit" style={{ padding: '0 12px', backgroundColor: '#10b981', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>
                        Add
                      </button>
                      <button type="button" onClick={() => setAddingAuditSubId(null)} style={{ background: 'none', color: 'var(--color-zinc-400)', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}>
                        Cancel
                      </button>
                    </form>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                    {currentPhase.inspectionChecklist.map((chk) => {
                      const checked = isCheckItemChecked(currentPhase.id, chk.id);
                      const isEditing = editingAuditId === chk.id;

                      return (
                        <div
                          key={chk.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            backgroundColor: checked ? 'rgba(16, 185, 129, 0.12)' : 'var(--color-zinc-900)',
                            border: '1px solid ' + (checked ? 'rgba(16, 185, 129, 0.3)' : 'var(--color-zinc-800)'),
                            transition: 'all 0.15s'
                          }}
                        >
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                              <input
                                type="text"
                                value={editingAuditText}
                                onChange={(e) => setEditingAuditText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEditAudit(null, chk.id);
                                  if (e.key === 'Escape') setEditingAuditId(null);
                                }}
                                autoFocus
                                style={{ flex: 1, backgroundColor: 'var(--color-zinc-950)', border: '1px solid #34d399', borderRadius: '4px', padding: '4px 8px', color: 'var(--color-zinc-100)', fontSize: '0.82rem', outline: 'none' }}
                              />
                              <button onClick={() => handleSaveEditAudit(null, chk.id)} style={{ background: '#10b981', color: '#000', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}>
                                <Check size={14} />
                              </button>
                              <button onClick={() => setEditingAuditId(null)} style={{ background: 'none', color: 'var(--color-zinc-400)', border: 'none', cursor: 'pointer' }}>
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div onClick={() => toggleCheckItem(currentPhase.id, chk.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {}}
                                  style={{ width: '16px', height: '16px', accentColor: '#10b981', cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: checked ? '#34d399' : 'var(--color-zinc-200)', textDecoration: checked ? 'line-through' : 'none' }}>
                                  {chk.text}
                                </span>
                              </div>

                              {isCustomizing && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.9 }}>
                                  <button onClick={() => { setEditingAuditId(chk.id); setEditingAuditText(chk.text); }} style={{ background: 'none', border: 'none', color: 'var(--color-zinc-400)', cursor: 'pointer', padding: '2px' }} title="Edit item">
                                    <Edit2 size={13} />
                                  </button>
                                  <button onClick={() => handleDeleteAudit(null, chk.id, chk.text)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }} title="Delete item">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Combined 5-Trade Checklist for Framing Combo */}
              {currentPhase.hasSubcategories && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '14px' }}>
                  {currentPhase.subcategories.map((sub) => (
                    <div
                      key={sub.id}
                      style={{
                        backgroundColor: 'var(--color-zinc-900)',
                        border: '1px solid var(--color-zinc-800)',
                        borderRadius: '6px',
                        padding: '10px 12px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '1rem' }}>{sub.icon}</span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-zinc-100)' }}>
                            {sub.name}
                          </span>
                        </div>
                        {isCustomizing && (
                          <button
                            onClick={() => setAddingAuditSubId(addingAuditSubId === sub.id ? null : sub.id)}
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(255, 255, 255, 0.06)',
                              border: '1px solid var(--color-zinc-700)',
                              color: 'var(--color-zinc-300)',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '2px'
                            }}
                          >
                            <Plus size={11} /> Add Item
                          </button>
                        )}
                      </div>

                      {/* Add Audit Item under this trade */}
                      {isCustomizing && addingAuditSubId === sub.id && (
                        <form onSubmit={(e) => handleAddAudit(sub.id, e)} style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                          <input
                            type="text"
                            placeholder={`New audit check for ${sub.name}...`}
                            value={newAuditInput}
                            onChange={(e) => setNewAuditInput(e.target.value)}
                            autoFocus
                            style={{ flex: 1, backgroundColor: 'var(--color-zinc-950)', border: '1px solid #34d399', borderRadius: '4px', padding: '4px 8px', color: 'var(--color-zinc-100)', fontSize: '0.8rem', outline: 'none' }}
                          />
                          <button type="submit" style={{ padding: '0 10px', backgroundColor: '#10b981', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer' }}>
                            Add
                          </button>
                          <button type="button" onClick={() => setAddingAuditSubId(null)} style={{ background: 'none', color: 'var(--color-zinc-400)', border: 'none', cursor: 'pointer', fontSize: '0.72rem' }}>
                            Cancel
                          </button>
                        </form>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {sub.inspectionChecklist.map((chk) => {
                          const checked = isCheckItemChecked(currentPhase.id, chk.id);
                          const isEditing = editingAuditId === `${sub.id}_${chk.id}`;

                          return (
                            <div
                              key={chk.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '6px',
                                padding: '6px 8px',
                                borderRadius: '4px',
                                backgroundColor: checked ? 'rgba(16, 185, 129, 0.12)' : 'var(--color-zinc-950)',
                                border: '1px solid ' + (checked ? 'rgba(16, 185, 129, 0.3)' : 'var(--color-zinc-800)'),
                                transition: 'all 0.15s'
                              }}
                            >
                              {isEditing ? (
                                <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
                                  <input
                                    type="text"
                                    value={editingAuditText}
                                    onChange={(e) => setEditingAuditText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveEditAudit(sub.id, chk.id);
                                      if (e.key === 'Escape') setEditingAuditId(null);
                                    }}
                                    autoFocus
                                    style={{ flex: 1, backgroundColor: 'var(--color-zinc-950)', border: '1px solid #34d399', borderRadius: '4px', padding: '3px 6px', color: 'var(--color-zinc-100)', fontSize: '0.8rem', outline: 'none' }}
                                  />
                                  <button onClick={() => handleSaveEditAudit(sub.id, chk.id)} style={{ background: '#10b981', color: '#000', border: 'none', borderRadius: '4px', padding: '3px 6px', cursor: 'pointer' }}>
                                    <Check size={12} />
                                  </button>
                                  <button onClick={() => setEditingAuditId(null)} style={{ background: 'none', color: 'var(--color-zinc-400)', border: 'none', cursor: 'pointer' }}>
                                    <X size={12} />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div onClick={() => toggleCheckItem(currentPhase.id, chk.id)} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, cursor: 'pointer' }}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {}}
                                      style={{ width: '15px', height: '15px', accentColor: '#10b981', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: checked ? '#34d399' : 'var(--color-zinc-200)', textDecoration: checked ? 'line-through' : 'none' }}>
                                      {chk.text}
                                    </span>
                                  </div>

                                  {isCustomizing && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', opacity: 0.9 }}>
                                      <button onClick={() => { setEditingAuditId(`${sub.id}_${chk.id}`); setEditingAuditText(chk.text); }} style={{ background: 'none', border: 'none', color: 'var(--color-zinc-400)', cursor: 'pointer', padding: '2px' }} title="Edit item">
                                        <Edit2 size={12} />
                                      </button>
                                      <button onClick={() => handleDeleteAudit(sub.id, chk.id, chk.text)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }} title="Delete item">
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                <button
                  onClick={handleFlagUncheckedWatchouts}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid #ef4444',
                    color: '#ef4444',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px'
                  }}
                >
                  <AlertTriangle size={14} /> Flag Unchecked as Watch-Outs
                </button>
                <button
                  onClick={handleScheduleInspection}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--color-amber-500)',
                    border: 'none',
                    color: '#000',
                    fontWeight: 800,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px'
                  }}
                >
                  <Calendar size={14} /> Passed — Schedule City Inspection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Item Cards List (For All, Watchouts, Subs, Reminders) */}
      {activeSubTab !== 'phases' && activeSubTab !== 'site_setup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredItems.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                backgroundColor: 'var(--color-zinc-900)',
                borderRadius: '8px',
                border: '1px dashed var(--color-zinc-800)',
                color: 'var(--color-zinc-400)'
              }}
            >
              <h3>No active items in this view</h3>
              <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Use Field Quick Capture above to log a note.</p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isCompleted = item.status === 'completed';
              const isWatchout = item.category === 'watchout';
              const isSub = item.category === 'subcontractor';

              return (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: 'var(--color-zinc-900)',
                    border: '1px solid var(--color-zinc-800)',
                    borderLeft:
                      '4px solid ' +
                      (isWatchout ? '#ef4444' : isSub ? 'var(--color-emerald-500)' : 'var(--color-amber-500)'),
                    borderRadius: '8px',
                    padding: '14px',
                    opacity: isCompleted ? 0.6 : 1
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(197, 160, 89, 0.15)',
                          color: 'var(--color-amber-500)',
                          fontSize: '0.72rem',
                          fontWeight: 800
                        }}
                      >
                        {item.lot || projectName}
                      </span>
                      {item.subcontractor && (
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            color: '#34d399',
                            fontSize: '0.72rem',
                            fontWeight: 700
                          }}
                        >
                          {item.subcontractor}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        onClick={() => handleToggleDone(item.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: isCompleted ? '#10b981' : 'var(--color-zinc-500)' }}
                        title={isCompleted ? 'Mark Pending' : 'Mark Completed'}
                      >
                        <CheckCircle2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      color: 'var(--color-zinc-100)',
                      textDecoration: isCompleted ? 'line-through' : 'none',
                      marginBottom: '6px'
                    }}
                  >
                    {item.title}
                  </div>

                  {item.notes && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-zinc-400)', margin: '4px 0 8px 0' }}>
                      📝 {item.notes}
                    </p>
                  )}

                  {item.targetDate && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-amber-500)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                      <Clock size={12} />
                      <span>Target: {new Date(item.targetDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({new Date(item.targetDate).toLocaleDateString()})</span>
                    </div>
                  )}

                  {isSub && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--color-zinc-800)' }}>
                      <a
                        href="tel:"
                        style={{
                          flex: 1,
                          padding: '6px 0',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          color: '#34d399',
                          textDecoration: 'none',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        <Phone size={13} /> Call Sub
                      </a>
                      <a
                        href={`sms:?body=${encodeURIComponent(item.title)}`}
                        style={{
                          flex: 1,
                          padding: '6px 0',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(197, 160, 89, 0.15)',
                          color: 'var(--color-amber-500)',
                          textDecoration: 'none',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        <MessageSquare size={13} /> Text Sub
                      </a>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Gemini AI Assistant Modal */}
      {isAssistantOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            zIndex: 3000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '620px',
              height: '85vh',
              backgroundColor: 'var(--color-zinc-900)',
              border: '1px solid var(--color-zinc-800)',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--color-zinc-800)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'var(--color-zinc-950)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-amber-500)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#000'
                  }}
                >
                  <Bot size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-zinc-100)', margin: 0 }}>
                    Adepec AI Field Assistant
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-amber-500)', margin: 0 }}>
                    Gemini AI Model & Natural Voice Readout
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  style={{ background: 'none', border: 'none', color: showSettings ? 'var(--color-amber-500)' : 'var(--color-zinc-400)', cursor: 'pointer' }}
                  title="Voice & API Settings"
                >
                  <Settings size={18} />
                </button>
                <button
                  onClick={() => {
                    setSpeechEnabled(!speechEnabled);
                    if (speechEnabled) window.speechSynthesis.cancel();
                  }}
                  style={{ background: 'none', border: 'none', color: speechEnabled ? 'var(--color-amber-500)' : 'var(--color-zinc-500)', cursor: 'pointer' }}
                  title={speechEnabled ? 'Mute Voice' : 'Enable Voice'}
                >
                  {speechEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
                <button
                  onClick={() => setIsAssistantOpen(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-zinc-400)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Settings Drawer */}
            {showSettings && (
              <div style={{ padding: '14px', backgroundColor: 'var(--color-zinc-950)', borderBottom: '1px solid var(--color-zinc-800)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Language Mode Selector */}
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-zinc-400)', display: 'block', marginBottom: '6px' }}>
                    🌍 Voice & Recognition Language / Idioma:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => { setAiLanguage('auto'); localStorage.setItem('jobscan_ai_lang', 'auto'); }}
                      style={{
                        padding: '8px 4px',
                        borderRadius: '6px',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        backgroundColor: aiLanguage === 'auto' ? 'var(--color-amber-500)' : 'var(--color-zinc-900)',
                        color: aiLanguage === 'auto' ? '#000' : 'var(--color-zinc-300)',
                        border: aiLanguage === 'auto' ? '1px solid var(--color-amber-500)' : '1px solid var(--color-zinc-800)',
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                    >
                      🌐 Auto
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAiLanguage('en'); localStorage.setItem('jobscan_ai_lang', 'en'); }}
                      style={{
                        padding: '8px 4px',
                        borderRadius: '6px',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        backgroundColor: aiLanguage === 'en' ? 'var(--color-amber-500)' : 'var(--color-zinc-900)',
                        color: aiLanguage === 'en' ? '#000' : 'var(--color-zinc-300)',
                        border: aiLanguage === 'en' ? '1px solid var(--color-amber-500)' : '1px solid var(--color-zinc-800)',
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                    >
                      🇺🇸 English
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAiLanguage('es'); localStorage.setItem('jobscan_ai_lang', 'es'); }}
                      style={{
                        padding: '8px 4px',
                        borderRadius: '6px',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        backgroundColor: aiLanguage === 'es' ? 'var(--color-amber-500)' : 'var(--color-zinc-900)',
                        color: aiLanguage === 'es' ? '#000' : 'var(--color-zinc-300)',
                        border: aiLanguage === 'es' ? '1px solid var(--color-amber-500)' : '1px solid var(--color-zinc-800)',
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                    >
                      🇲🇽 Español
                    </button>
                  </div>
                </div>

                {/* Voice Selector */}
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-zinc-400)', display: 'block', marginBottom: '4px' }}>
                    🎙️ Natural Speech Synthesis Voice:
                  </label>
                  <select
                    value={selectedVoiceURI}
                    onChange={(e) => setSelectedVoiceURI(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--color-zinc-900)',
                      border: '1px solid var(--color-zinc-800)',
                      color: 'var(--color-zinc-100)',
                      fontSize: '0.82rem',
                      outline: 'none'
                    }}
                  >
                    {availableVoices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang}) {v.name.includes('Natural') || v.name.includes('Google') ? '✨ Recommended' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Messages Body */}
            <div
              style={{
                flex: 1,
                padding: '16px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                backgroundColor: 'var(--color-zinc-950)'
              }}
            >
              {aiMessages.map((msg, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start'
                  }}
                >
                  <div
                    style={{
                      maxWidth: '85%',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      backgroundColor: msg.sender === 'user' ? 'var(--color-amber-500)' : 'var(--color-zinc-900)',
                      color: msg.sender === 'user' ? '#000' : 'var(--color-zinc-100)',
                      fontWeight: msg.sender === 'user' ? 600 : 400,
                      fontSize: '0.88rem',
                      lineHeight: '1.5',
                      whiteSpace: 'pre-wrap',
                      border: msg.sender === 'user' ? 'none' : '1px solid var(--color-zinc-800)'
                    }}
                  >
                    {msg.text}
                  </div>
                  <span style={{ fontSize: '0.68rem', color: 'var(--color-zinc-500)', marginTop: '3px' }}>
                    {msg.timestamp}
                  </span>
                </div>
              ))}

              {aiLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-amber-500)', fontSize: '0.82rem' }}>
                  <Sparkles size={15} className="animate-spin" /> Gemini AI is thinking...
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <form
              onSubmit={handleSendAiMessage}
              style={{
                padding: '12px',
                borderTop: '1px solid var(--color-zinc-800)',
                backgroundColor: 'var(--color-zinc-900)',
                display: 'flex',
                gap: '8px',
                alignItems: 'center'
              }}
            >
              <button
                type="button"
                onClick={() => {
                  const nextLang = aiLanguage === 'es' ? 'en' : 'es';
                  setAiLanguage(nextLang);
                  localStorage.setItem('jobscan_ai_lang', nextLang);
                }}
                style={{
                  padding: '0 8px',
                  backgroundColor: aiLanguage === 'es' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                  border: '1px solid ' + (aiLanguage === 'es' ? '#22c55e' : '#3b82f6'),
                  color: aiLanguage === 'es' ? '#86efac' : '#93c5fd',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  whiteSpace: 'nowrap'
                }}
                title="Click to toggle Mic Language (English / Español)"
              >
                {aiLanguage === 'es' ? '🇲🇽 ES' : '🇺🇸 EN'}
              </button>
              <button
                type="button"
                onClick={handleAiVoice}
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'var(--color-zinc-950)',
                  border: '1px solid var(--color-zinc-800)',
                  borderRadius: '6px',
                  color: 'var(--color-amber-500)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Voice Dictation (Mic)"
              >
                <Mic size={18} />
              </button>
              <input
                type="text"
                placeholder={aiLanguage === 'es' ? 'Pregunta en Español: "¿Cuánto balance con el pintor?"...' : 'Ask Gemini in English or Spanish...'}
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                disabled={aiLoading}
                style={{
                  flex: 1,
                  backgroundColor: 'var(--color-zinc-950)',
                  border: '1px solid var(--color-zinc-800)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  color: 'var(--color-zinc-100)',
                  fontSize: '0.88rem',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={aiLoading}
                style={{
                  padding: '10px 16px',
                  backgroundColor: 'var(--color-amber-500)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Send size={15} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
