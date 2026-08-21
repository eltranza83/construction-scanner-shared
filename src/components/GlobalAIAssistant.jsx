import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Mic,
  Send,
  X,
  Volume2,
  VolumeX,
  Settings,
  Sparkles,
  Zap,
  Loader2,
  FileText,
  ExternalLink,
  Square
} from 'lucide-react';
import {
  loadProjectSpecs,
  saveProjectSpecs,
  askGeminiBrain,
  loadProjectDriveTree,
  saveProjectDriveTree,
  loadProjectDashboard
} from '../services/builderBrainService';
import { runAllAiToolDiagnostics, evaluateSystemAndDataHealth } from '../services/aiTools';
import {
  fetchProjectDriveTree,
  createFolder,
  trashDriveFileOrFolder,
  syncFinishSpecsToDrive,
  fetchDriveFileBase64
} from '../services/googleDrive';

import DocumentViewerModal from './DocumentViewerModal';
import {
  VoiceStateMachine,
  VOICE_STATES,
  VOICE_MODES,
  isExitIntent,
  containsWakeWord,
  stripWakeWord
} from '../services/voiceStateMachine';



const findReferencedDriveFile = (query, driveTree, messages = []) => {
  if (!driveTree || !query) return null;
  const q = query.toLowerCase().trim();
  const allFiles = [];
  if (driveTree.directFiles) {
    driveTree.directFiles.forEach((f) => allFiles.push({ ...f, folderName: 'root' }));
  }
  if (driveTree.subfolders) {
    driveTree.subfolders.forEach((sub) => {
      if (sub.files) {
        sub.files.forEach((f) => allFiles.push({ ...f, folderName: sub.folderName }));
      }
    });
  }

  // 0. Check numbered index requests (e.g. "number 2", "file 1", "show #3", "bring up 2")
  const numMatch = q.match(/(?:number|file|item|#)\s*(\d+)/i) || q.match(/^(?:bring up|show|open|view|pull up|fetch)\s+(\d+)$/i);
  if (numMatch && Array.isArray(messages)) {
    const targetIndex = parseInt(numMatch[1], 10);
    // Find the most recent AI message with a numbered list
    const lastListMsg = [...messages].reverse().find((m) => m.sender === 'ai' && /\d+\.\s+/m.test(m.text));
    if (lastListMsg && targetIndex > 0) {
      const listLines = lastListMsg.text.split('\n').filter((l) => /^\s*\d+\.\s+/.test(l));
      if (listLines[targetIndex - 1]) {
        const itemLine = listLines[targetIndex - 1].replace(/^\s*\d+\.\s+[`'"]?/, '').replace(/[`'"]?$/, '').trim();
        const matched = allFiles.find((f) => itemLine.toLowerCase().includes(f.name.toLowerCase()) || f.name.toLowerCase().includes(itemLine.toLowerCase()));
        if (matched) return matched;
      }
    }
  }

  // 1. Check direct file name matching
  for (const f of allFiles) {
    const fNameLow = f.name.toLowerCase();
    const fClean = fNameLow.replace(/\.[a-z0-9]+$/i, '').replace(/[_\-\s]+/g, ' ');
    if (q.includes(fNameLow) || (fClean.length > 5 && q.includes(fClean))) {
      return f;
    }
  }

  // 2. Check subfolder name matching (e.g. "closing settlement", "processed invoices", "x-ray photos")
  if (driveTree.subfolders) {
    for (const sub of driveTree.subfolders) {
      const subLow = sub.folderName.toLowerCase();
      if (q.includes(subLow) || (subLow.includes('closing') && q.includes('closing'))) {
        if (sub.files && sub.files.length > 0) {
          const pdf = sub.files.find((f) => f.name.toLowerCase().endsWith('.pdf') || f.mimeType === 'application/pdf');
          return pdf ? { ...pdf, folderName: sub.folderName } : { ...sub.files[0], folderName: sub.folderName };
        }
      }
    }
  }

  // 3. Keyword matching (e.g. "closing cost", "settlement statement", "allocation")
  if (q.includes('closing') || q.includes('settlement') || q.includes('allocation')) {
    const closingPdf = allFiles.find((f) => f.name.toLowerCase().includes('closing') || f.name.toLowerCase().includes('allocation') || f.folderName.toLowerCase().includes('closing'));
    if (closingPdf) return closingPdf;
  }

  // 4. Contextual Pronoun Resolution ("open it", "pull it up", "show it", "go ahead and open it", "yes open it")
  const isPronounOrConfirm =
    /\b(open it|show it|pull it up|view it|see it|open that|show that|bring it up|open the file|show the file|open document|show document)\b/i.test(q) ||
    /^(yes|yeah|sure|yep|ok|okay|please|go ahead|proceed)\b/i.test(q);

  if (isPronounOrConfirm && Array.isArray(messages) && messages.length > 0) {
    const reversed = [...messages].reverse();
    for (const msg of reversed) {
      const txt = (msg.text || '').toLowerCase();
      if (!txt) continue;

      // Find all files in driveTree mentioned in this previous message
      const mentioned = allFiles.filter((f) => {
        const fn = f.name.toLowerCase();
        const base = fn.replace(/\.[a-z0-9]+$/i, '');
        return txt.includes(fn) || (base.length > 5 && txt.includes(base));
      });

      if (mentioned.length === 1) {
        // Unambiguously single matching file in previous context
        return mentioned[0];
      }
      if (mentioned.length > 1) {
        // Multiple matches in context
        return { isAmbiguous: true, matches: mentioned };
      }

      // If previous AI message attached viewFiles
      if (msg.viewFiles && msg.viewFiles.length === 1) {
        const vf = allFiles.find((f) => f.id === msg.viewFiles[0].fileId);
        if (vf) return vf;
      }
    }
  }

  return null;
};

export function formatMessageDisplay(text) {
  if (!text || typeof text !== 'string') return '';
  let clean = text;

  // 1. Strip redundant duplicate parenthesized dates (e.g. "July 22, 2026 (2026-07-22)" -> "July 22, 2026")
  clean = clean.replace(/\s*\(\d{4}-\d{2}-\d{2}\)/g, '');

  // 2. Convert raw ISO dates (YYYY-MM-DD) to friendly dates (e.g. August 1, 2026)
  clean = clean.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_match, y, m, d) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const mIdx = parseInt(m, 10) - 1;
    const dayNum = parseInt(d, 10);
    if (months[mIdx]) {
      return `${months[mIdx]} ${dayNum}, ${y}`;
    }
    return `${y}-${m}-${d}`;
  });

  // 3. Convert markdown bullet lists to clean bullet points
  clean = clean.replace(/^\s*[*•-]\s+/gm, '• ');

  // 4. Strip all markdown bold/italic asterisks completely (e.g. **Text** -> Text, *Text* -> Text)
  clean = clean.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
  clean = clean.replace(/\*/g, '');

  return clean;
}




export default function GlobalAIAssistant({ activeProject, selectedFolder, googleToken }) {
  const projectId = activeProject?.id || selectedFolder?.name || 'default_site';
  const projectName = activeProject?.name || selectedFolder?.name || 'Active Job Site';

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    const hr = new Date().getHours();
    const timeGreeting = hr < 12 ? 'Good morning Sir' : hr < 17 ? 'Good afternoon Sir' : 'Good evening Sir';
    return [
      {
        sender: 'ai',
        text: `${timeGreeting}. Online and at your service. I have indexed all project financials, Google Drive files, and field protocols for "${projectName}". How may I assist you today?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoiceConfig, setSelectedVoiceConfig] = useState(() => {
    try {
      const raw = localStorage.getItem('jobscan_ai_voice_config');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  });
  const [selectedVoiceURI, setSelectedVoiceURI] = useState(() => {
    const raw = localStorage.getItem('jobscan_ai_voice_config');
    if (raw) {
      try { return JSON.parse(raw).uri || ''; } catch (_) {}
    }
    return localStorage.getItem('jobscan_ai_voice_uri') || '';
  });
  const [aiLanguage, setAiLanguage] = useState(() => localStorage.getItem('jobscan_ai_lang') || 'auto');
  const [forceDeepReasoning, setForceDeepReasoning] = useState(false);
  const [devMode, setDevMode] = useState(() => {
    try {
      return localStorage.getItem('jobscan_dev_mode') === 'true';
    } catch (_) {
      return false;
    }
  });
  const [showTestSuite, setShowTestSuite] = useState(false);
  const [testSuiteData, setTestSuiteData] = useState(null);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [activityLogs, setActivityLogs] = useState(() => {
    try {
      const saved = localStorage.getItem('jobscan_ai_activity_logs');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('jobscan_gemini_api_key') || localStorage.getItem('jobscan_gemini_key') || '');
  const [driveTree, setDriveTree] = useState(() => loadProjectDriveTree(projectId));
  const [activePreviewFile, setActivePreviewFile] = useState(null);

  // Voice State Machine & Continuous Hands-Free State
  const [voiceMode, setVoiceMode] = useState(() => {
    try {
      return localStorage.getItem('jobscan_voice_mode') || VOICE_MODES.CONTINUOUS_HANDS_FREE;
    } catch (_) {
      return VOICE_MODES.CONTINUOUS_HANDS_FREE;
    }
  });

  const [silenceTimeoutSec, setSilenceTimeoutSec] = useState(() => {
    try {
      return parseInt(localStorage.getItem('jobscan_silence_timeout_sec') || '7', 10);
    } catch (_) {
      return 7;
    }
  });
  const [wakeWordEnabled, setWakeWordEnabled] = useState(() => {
    try {
      return localStorage.getItem('jobscan_wake_word_enabled') === 'true';
    } catch (_) {
      return false;
    }
  });
  const [voiceState, setVoiceState] = useState(VOICE_STATES.IDLE);
  const [silenceRemaining, setSilenceRemaining] = useState(7);
  const voiceSmRef = useRef(null);
  const recognitionRef = useRef(null);

  if (!voiceSmRef.current) {
    voiceSmRef.current = new VoiceStateMachine({
      mode: voiceMode,
      silenceTimeoutSec,
      wakeWordEnabled
    });
  }

  const chatEndRef = useRef(null);


  const handleRunDiagnosticSuite = async () => {
    setIsRunningTests(true);
    try {
      const projectContext = {
        items: [],
        dashboardData: loadProjectDashboard(projectId),
        driveTree,
        projectSpecs: loadProjectSpecs(projectId),
        siteSetupData: null,
        apiKey,
        googleToken
      };
      const data = await runAllAiToolDiagnostics(projectContext);
      setTestSuiteData(data);
    } catch (err) {
      console.error('Error running test suite:', err);
    } finally {
      setIsRunningTests(false);
    }
  };

  const handleOpenDocumentPreview = (fileObj) => {
    if (!fileObj || !fileObj.fileId) return;
    setActivePreviewFile(fileObj);
  };


  // Sync Google Drive folders & files manifest
  useEffect(() => {
    if (!googleToken || !activeProject?.folderId) return;
    let isSubscribed = true;

    async function syncDriveManifest() {
      try {
        const tree = await fetchProjectDriveTree(googleToken, activeProject.folderId);
        if (tree && isSubscribed) {
          setDriveTree(tree);
          saveProjectDriveTree(projectId, tree);
        }
      } catch (err) {
        console.warn('Drive manifest background fetch note:', err);
      }
    }

    syncDriveManifest();
    return () => {
      isSubscribed = false;
    };
  }, [googleToken, activeProject?.folderId, projectId]);

  const getBestBritishMaleVoice = (voices) => {
    if (!voices || voices.length === 0) return null;
    const femaleNames = ['Susan', 'Hazel', 'Victoria', 'Zira', 'Samantha', 'Karen', 'Serena', 'Kate', 'Stephanie', 'Martha', 'Female', 'en-gb-x-gba', 'en-gb-x-gbd', 'en-gb-x-gbf', 'en-us-x-sfg', 'en-au'];

    // Platform Priority 1: Windows (Microsoft George / Natural)
    const msGeorge = voices.find((v) => (v.lang.startsWith('en-GB') || v.lang === 'en-GB' || v.lang === 'en_GB') && (v.name.includes('George') || v.name.includes('Ryan')));
    if (msGeorge) return msGeorge;

    // Platform Priority 2: Apple iOS / iPadOS / macOS (Daniel, Oliver, Arthur, Aaron)
    const appleMale = voices.find(
      (v) => (v.lang.startsWith('en-GB') || v.lang === 'en-GB' || v.lang.startsWith('en')) && (v.name.includes('Daniel') || v.name.includes('Oliver') || v.name.includes('Arthur') || v.name.includes('Aaron') || v.name.includes('Gordon'))
    );
    if (appleMale) return appleMale;

    // Platform Priority 3: Google Android (Google UK English Male, en-gb-x-rjs, en-gb-x-gbb)
    const googleUkMale = voices.find(
      (v) => (v.lang.startsWith('en-GB') || v.lang === 'en-GB' || v.lang === 'en_GB') && (v.name.includes('UK English Male') || v.name.includes('rjs') || v.name.includes('gbb') || v.name.includes('gbc'))
    );
    if (googleUkMale) return googleUkMale;

    // Platform Priority 4: Android standard English (United Kingdom) / en-GB
    const androidUk = voices.find((v) => (v.lang.startsWith('en-GB') || v.lang === 'en-GB' || v.lang === 'en_GB' || v.name.includes('United Kingdom')));
    if (androidUk) return androidUk;

    // Platform Priority 5: Any non-blacklisted en-GB voice
    const safeUk = voices.find(
      (v) => (v.lang.startsWith('en-GB') || v.lang === 'en-GB' || v.lang === 'en_GB') && !femaleNames.some((f) => v.name.includes(f))
    );
    if (safeUk) return safeUk;

    // Platform Priority 6: Any general English male voice
    const generalMale = voices.find(
      (v) => v.lang.startsWith('en') && (v.name.includes('George') || v.name.includes('Daniel') || v.name.includes('Oliver') || v.name.includes('Arthur') || v.name.includes('David') || v.name.includes('Guy') || v.name.includes('Male'))
    );
    if (generalMale) return generalMale;

    // Platform Priority 7: Fallback to en-US (to prevent en-AU Australia default on Android)
    const usVoice = voices.find((v) => v.lang.startsWith('en-US') || v.lang === 'en-US' || v.lang === 'en_US');
    if (usVoice) return usVoice;

    return voices.find((v) => v.lang.startsWith('en')) || voices[0];
  };

  const getBestSpanishMaleVoice = (voices) => {
    if (!voices || voices.length === 0) return null;
    const femaleNames = ['Sabina', 'Dalia', 'Paulina', 'Helena', 'Laura', 'Monica', 'Female', 'es-es-x-eea'];
    const maleNames = ['Jorge', 'Raul', 'Pablo', 'Carlos', 'Alvaro', 'Enrique', 'Male', 'rjs'];
    const maleEs = voices.find((v) => v.lang.startsWith('es') && maleNames.some((m) => v.name.includes(m)));
    if (maleEs) return maleEs;
    const safeEs = voices.find((v) => v.lang.startsWith('es') && !femaleNames.some((f) => v.name.includes(f)));
    if (safeEs) return safeEs;
    return voices.find((v) => v.lang.startsWith('es')) || null;
  };

  const resolveVoice = (voices, config, isSpanish) => {
    if (!Array.isArray(voices) || voices.length === 0) return null;

    if (isSpanish) {
      if (config && (config.lang?.startsWith('es') || config.name?.toLowerCase().includes('spanish'))) {
        const match = voices.find(v => (config.uri && v.voiceURI === config.uri) || (config.name && v.name === config.name));
        if (match) return match;
      }
      return getBestSpanishMaleVoice(voices);
    }

    if (config) {
      if (config.uri) {
        const matchUri = voices.find(v => v.voiceURI === config.uri);
        if (matchUri) return matchUri;
      }
      if (config.name) {
        const matchName = voices.find(v => v.name === config.name);
        if (matchName) return matchName;
      }
      if (config.lang) {
        const matchLang = voices.find(v => v.lang.replace('_', '-').toLowerCase() === config.lang.replace('_', '-').toLowerCase());
        if (matchLang) return matchLang;
      }
    }

    return getBestBritishMaleVoice(voices);
  };

  // Load natural voices (English + Spanish) with J.A.R.V.I.S. British English priority
  useEffect(() => {
    const loadVoices = () => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en') || v.lang.startsWith('es'));
        setAvailableVoices(voices);
        
        let activeConfig = selectedVoiceConfig;
        if (!activeConfig) {
          try {
            const raw = localStorage.getItem('jobscan_ai_voice_config');
            if (raw) activeConfig = JSON.parse(raw);
          } catch (_) {}
        }

        const resolved = resolveVoice(voices, activeConfig, false);
        if (resolved) {
          setSelectedVoiceURI(resolved.voiceURI || resolved.name);
        }
      }
    };
    loadVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const speakText = (text, userQuery = '') => {
    if (!speechEnabled || !('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      let clean = String(text);

      const q = String(userQuery).toLowerCase();
      const isReadAllRequested =
        q.includes('read all') ||
        q.includes('read them all') ||
        q.includes('read the rest') ||
        q.includes('driving') ||
        q.includes('read it to me') ||
        q.includes('read them to me');

      // Smart spoken list handler:
      // If text contains a list of items (e.g. "1. ...", "* ...", "- ...")
      const lines = clean.split('\n');
      const listLineIndices = [];
      lines.forEach((l, idx) => {
        if (/^\s*(?:\d+[\.\)]|[-•*])\s+/.test(l)) {
          listLineIndices.push(idx);
        }
      });

      if (!isReadAllRequested && listLineIndices.length > 4) {
        // Long list (>4 items): keep intro + first 3 items + spoken summary
        const cutoffIdx = listLineIndices[3];
        const remainingCount = listLineIndices.length - 3;
        const keptLines = lines.slice(0, cutoffIdx);
        keptLines.push(`plus ${remainingCount} more items on your screen. Would you like me to read the rest?`);
        clean = keptLines.join('. ');
      }

      // 1. Strip redundant duplicate parenthesized dates (e.g. "(2026-07-22)")
      clean = clean.replace(/\s*\(\d{4}-\d{2}-\d{2}\)/g, '');

      // 2. Natural Spoken Date Formatter: replace 2026-08-01 with "August 1st, 2026"
      clean = clean.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_match, y, m, d) => {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const mIdx = parseInt(m, 10) - 1;
        const dayNum = parseInt(d, 10);
        if (months[mIdx]) {
          const suffix = (dayNum === 1 || dayNum === 21 || dayNum === 31) ? 'st' : (dayNum === 2 || dayNum === 22) ? 'nd' : (dayNum === 3 || dayNum === 23) ? 'rd' : 'th';
          return `${months[mIdx]} ${dayNum}${suffix}, ${y}`;
        }
        return `${y} ${m} ${d}`;
      });

      clean = clean
        .replace(/\(Folder ID:[^\)]+\)/gi, '')
        .replace(/\(File ID:[^\)]+\)/gi, '')
        .replace(/\b(?:Folder|File)\s+ID:\s*[`'"]?[a-zA-Z0-9_\-]+[`'"]?/gi, '')
        .replace(/\b[a-zA-Z0-9_\-]{24,}\b/g, '')
        .replace(/[*_#🚨⏰👷📍•`]/g, '')
        .replace(/[\[\]\(\)]/g, ' ')
        .replace(/\n+/g, '. ')
        .replace(/\.pdf\b/gi, '')
        .replace(/\.txt\b/gi, '')
        .replace(/\.docx?\b/gi, '')
        .replace(/[_\-]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();




      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.15; // Natural, clear executive cadence
      utterance.pitch = 1.0; // Natural, clean pitch

      // Retrieve live voices directly from browser engine (crucial for mobile Android & iOS)
      const liveVoices = (window.speechSynthesis.getVoices && window.speechSynthesis.getVoices().length > 0)
        ? window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en') || v.lang.startsWith('es'))
        : availableVoices;

      let currentConfig = selectedVoiceConfig;
      if (!currentConfig) {
        try {
          const raw = localStorage.getItem('jobscan_ai_voice_config');
          if (raw) currentConfig = JSON.parse(raw);
        } catch (_) {}
      }

      const isSpanish = /[áéíóúüñ¿¡]/i.test(text) || /\b(el|la|los|las|un|una|del|por|para|con|este|esta|lote|plomero|electricista|dinero|gastado|cuanto|quien|recordatorio|buenos|dias|tardes|hola|subcontratista|factura|presupuesto)\b/i.test(text);

      if (isSpanish || aiLanguage === 'es') {
        const spanishVoice = resolveVoice(liveVoices, currentConfig, true);
        if (spanishVoice) {
          utterance.voice = spanishVoice;
          utterance.lang = spanishVoice.lang || 'es-US';
        } else {
          utterance.lang = 'es-US';
        }
      } else {
        const britishVoice = resolveVoice(liveVoices, currentConfig, false);
        if (britishVoice) {
          utterance.voice = britishVoice;
          utterance.lang = britishVoice.lang || 'en-GB';
        } else {
          utterance.lang = 'en-GB';
        }
      }

      const activeSession = voiceSmRef.current?.currentSessionId;
      utterance.onstart = () => {
        voiceSmRef.current?.startSpeaking(clean, 'tts_started');
      };
      utterance.onend = () => {
        voiceSmRef.current?.finishSpeaking('tts_ended', activeSession);
      };
      utterance.onerror = (err) => {
        voiceSmRef.current?.handleError('tts-error', err?.error || 'speech synthesis error', activeSession);
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
      voiceSmRef.current?.finishSpeaking('tts_catch_error');
    }
  };



  const executeMessage = async (queryText) => {
    if (!queryText || !queryText.trim() || isLoading) return;
    const query = queryText.trim();
    setInput('');

    const userMsg = {
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      let currentLiveTree = driveTree;
      if (googleToken && activeProject?.folderId) {
        try {
          const freshTree = await fetchProjectDriveTree(googleToken, activeProject.folderId);
          if (freshTree) {
            currentLiveTree = freshTree;
            setDriveTree(freshTree);
            saveProjectDriveTree(projectId, freshTree);
          }
        } catch (treeErr) {
          console.warn('Live drive tree refresh warning:', treeErr);
        }
      }

      let fileAttachment = null;
      const targetFile = findReferencedDriveFile(query, currentLiveTree, messages);
      if (targetFile && targetFile.id && googleToken) {
        try {
          fileAttachment = await fetchDriveFileBase64(googleToken, targetFile.id);
        } catch (fileErr) {
          console.warn('Drive file fetch attachment warning:', fileErr);
        }
      }

      const currentDashboard = loadProjectDashboard(projectId);
      const answerPayload = await askGeminiBrain(query, [], projectName, apiKey, currentDashboard, projectId, messages, currentLiveTree, fileAttachment, forceDeepReasoning);
      const answer = typeof answerPayload === 'object' && answerPayload.text !== undefined ? answerPayload.text : String(answerPayload || '');
      const telemetry = typeof answerPayload === 'object' && answerPayload.telemetry ? answerPayload.telemetry : null;


      let cleanAnswer = answer;
      const actionCreateMatch = answer.match(/\[\[ACTION:CREATE_FOLDER:([^\]]+)\]\]/);
      if (actionCreateMatch && actionCreateMatch[1]) {
        let fName = actionCreateMatch[1].replace(/^(and\s+)?(just\s+)?(call\s+it\s+|called\s+|named\s+|llamada\s+)/i, '').replace(/^["']|["']$/g, '').trim();
        if (googleToken && activeProject?.folderId && fName) {
          try {
            await createFolder(googleToken, fName, activeProject.folderId);
            const updatedTree = await fetchProjectDriveTree(googleToken, activeProject.folderId);
            if (updatedTree) {
              setDriveTree(updatedTree);
              saveProjectDriveTree(projectId, updatedTree);
            }
          } catch (driveErr) {
            console.warn('Drive create folder action warning:', driveErr);
          }
        }
        cleanAnswer = cleanAnswer.replace(/\[\[ACTION:CREATE_FOLDER:[^\]]+\]\]/, '').trim();
      }

      const actionDeleteMatch = answer.match(/\[\[ACTION:DELETE_FOLDER:([^\]]+)\]\]/);
      if (actionDeleteMatch && actionDeleteMatch[1]) {
        let fName = actionDeleteMatch[1].replace(/^(and\s+)?(just\s+)?(called\s+|named\s+|llamada\s+)/i, '').replace(/^["']|["']$/g, '').trim().toLowerCase();
        if (googleToken && activeProject?.folderId && driveTree?.subfolders && fName) {
          const matchFolder = driveTree.subfolders.find(
            (f) => f.folderName.toLowerCase().includes(fName) || fName.includes(f.folderName.toLowerCase())
          );
          if (matchFolder && matchFolder.folderId) {
            try {
              await trashDriveFileOrFolder(googleToken, matchFolder.folderId);
              const updatedTree = await fetchProjectDriveTree(googleToken, activeProject.folderId);
              if (updatedTree) {
                setDriveTree(updatedTree);
                saveProjectDriveTree(projectId, updatedTree);
              }
            } catch (driveErr) {
              console.warn('Drive trash folder action warning:', driveErr);
            }
          }
        }
        cleanAnswer = cleanAnswer.replace(/\[\[ACTION:DELETE_FOLDER:[^\]]+\]\]/, '').trim();
      }



      // 4. Add Finish Selection / Paint Spec Action
      const actionAddSpecMatches = [...answer.matchAll(/\[\[ACTION:ADD_SPEC:([^\]]+)\]\]/g)];
      if (actionAddSpecMatches.length > 0) {
        const existingSpecs = loadProjectSpecs(projectId);
        const newSpecs = [];
        actionAddSpecMatches.forEach((m) => {
          try {
            const data = JSON.parse(m[1]);
            newSpecs.push({
              id: 'spec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
              category: data.category || 'Paint',
              location: data.location || 'General',
              brand: data.brand || data.supplier || '',
              code: data.code || data.title || '',
              sheen: data.sheen || data.specs || '',
              notes: data.notes || '',
              createdAt: new Date().toISOString()
            });
          } catch (err) {
            console.warn('Failed to parse ADD_SPEC payload:', err);
          }
        });
        if (newSpecs.length > 0) {
          const updatedSpecs = [...newSpecs, ...existingSpecs];
          saveProjectSpecs(projectId, updatedSpecs);
          if (googleToken && activeProject?.folderId) {
            syncFinishSpecsToDrive(googleToken, activeProject.folderId, projectName, updatedSpecs);
          }
        }
        cleanAnswer = cleanAnswer.replace(/\[\[ACTION:ADD_SPEC:[^\]]+\]\]/g, '').trim();
      }

      // 5. Interactive Document & Receipt Viewer Action
      const actionViewFileMatches = [...answer.matchAll(/\[\[ACTION:VIEW_FILE:([^\]]+)\]\]/g)];
      const viewFiles = [];
      if (actionViewFileMatches.length > 0) {
        actionViewFileMatches.forEach((m) => {
          try {
            const data = JSON.parse(m[1]);
            if (data.fileId) {
              viewFiles.push({
                fileId: data.fileId,
                fileName: data.fileName || 'Document.pdf',
                folderName: data.folderName || 'Google Drive'
              });
            }
          } catch (err) {
            console.warn('Failed to parse VIEW_FILE payload:', err);
          }
        });
        cleanAnswer = cleanAnswer.replace(/\[\[ACTION:VIEW_FILE:[^\]]+\]\]/g, '').trim();
      }

      // Check if user or context requested viewing / opening a file
      const isExplicitViewCommand =
        /^(can you\s+)?(show|open|pull up|fetch|view|display|let me see)\b/i.test(query.trim()) ||
        /\b(pull it up|open it|show it|view it|let me view it|view this file|open this file|show this file|let me see it)\b/i.test(query.trim());

      const isViewIntent =
        isExplicitViewCommand ||
        /\b(open it|show it|pull it up|view it|let me view it|see it|open that|show that|bring it up|open the file|show the file|open document|show document)\b/i.test(query.trim()) ||
        /^(yes|yeah|sure|yep|ok|okay|please|go ahead|proceed)\b/i.test(query.trim());


      if (targetFile && targetFile.id && !targetFile.isAmbiguous && viewFiles.length === 0 && isViewIntent) {
        viewFiles.push({
          fileId: targetFile.id,
          fileName: targetFile.name,
          folderName: targetFile.folderName || 'Google Drive'
        });
      }

      // Contextual fallback: If Gemini's text explicitly references opening/viewing an exact Google Drive file
      if (viewFiles.length === 0 && (isViewIntent || /\b(opened|opening|here is the file|view on your screen)\b/i.test(cleanAnswer))) {
        const allDriveFiles = [];
        if (currentLiveTree?.directFiles) allDriveFiles.push(...currentLiveTree.directFiles);
        if (currentLiveTree?.subfolders) {
          currentLiveTree.subfolders.forEach((s) => {
            if (s.files) s.files.forEach((f) => allDriveFiles.push({ ...f, folderName: s.folderName }));
          });
        }
        const matchingFileInAnswer = allDriveFiles.find((f) =>
          cleanAnswer.includes(f.name) ||
          cleanAnswer.includes(`'${f.name}'`) ||
          cleanAnswer.includes(`"${f.name}"`) ||
          cleanAnswer.includes(`\`${f.name}\``)
        );
        if (matchingFileInAnswer && matchingFileInAnswer.id) {
          viewFiles.push({
            fileId: matchingFileInAnswer.id,
            fileName: matchingFileInAnswer.name,
            folderName: matchingFileInAnswer.folderName || 'Google Drive'
          });
        }
      }


      // Format inline lists with clean linebreaks
      cleanAnswer = cleanAnswer.replace(/:\s*1\.\s+/g, ':\n\n1. ');

      const aiMsg = {
        sender: 'ai',
        text: cleanAnswer,
        viewFiles: viewFiles.length > 0 ? viewFiles : undefined,
        telemetry,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, aiMsg]);
      speakText(cleanAnswer, query);


      // Auto-open fullscreen document preview modal (Option B: strictly only when J.A.R.V.I.S. explicitly confirmed opening via action tag)
      // When J.A.R.V.I.S. is just asking a clarifying question, the interactive card appears in the chat message for manual tap without covering the screen unprompted.
      const isConfirmedAction = actionViewFileMatches.length > 0;
      if (viewFiles.length > 0 && isConfirmedAction) {
        handleOpenDocumentPreview(viewFiles[0]);
      }


      // Determine data provenance source
      const source = telemetry?.source || (telemetry?.toolsExecuted?.length > 0 ? 'Local Tool Data' : (telemetry?.modelUsed?.includes('Local') ? 'Local Project Ledger' : 'Gemini Cloud AI'));

      // Append to AI Activity Log & Browser Console for conclusive proof
      const logEntry = {
        id: 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        query,
        modelUsed: telemetry?.modelUsed || 'gemini-flash-latest',
        source,
        httpStatus: telemetry?.errorCode ? `Notice (${telemetry.errorCode})` : '200 OK',
        intent: telemetry?.intent || 'Standard Lookup',
        durationMs: telemetry?.durationMs || 0,
        toolsExecuted: telemetry?.toolsExecuted || [],
        finalAnswer: cleanAnswer,
        fallbackTriggered: Boolean(telemetry?.fallbackTriggered),
        resultSummary: cleanAnswer.slice(0, 160) + (cleanAnswer.length > 160 ? '...' : '')
      };

      console.log('🤖 [J.A.R.V.I.S. Activity Log Entry]', {
        query,
        source: logEntry.source,
        modelCalled: logEntry.modelUsed,
        httpStatus: logEntry.httpStatus,
        toolsInvoked: logEntry.toolsExecuted.map(t => ({ tool: t.name, args: t.args, dataReturned: t.result })),
        finalSynthesizedAnswer: cleanAnswer,
        latencyMs: logEntry.durationMs
      });


      setActivityLogs((prev) => {
        const updated = [logEntry, ...prev.slice(0, 49)];
        try {
          localStorage.setItem('jobscan_ai_activity_logs', JSON.stringify(updated));
        } catch (_) {}
        return updated;
      });
    } catch (err) {
      console.error('Global AI Assistant error:', err);
      const errMsg = {
        sender: 'ai',
        text: `⚠️ I had a temporary issue connecting: ${err.message || 'Please try again.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    executeMessage(input);
  };

  // 1. Voice State Machine Subscription
  useEffect(() => {
    const sm = voiceSmRef.current;
    if (!sm) return;

    const unsubscribe = sm.subscribe((snapshot) => {
      setVoiceState(snapshot.state);
      setSilenceRemaining(snapshot.silenceRemaining);
      setIsRecording(snapshot.state === VOICE_STATES.LISTENING || snapshot.state === VOICE_STATES.AUTO_LISTENING);
    });

    return () => {
      unsubscribe();
      sm.clearTimers();
    };
  }, []);


  // 2. Sync Configuration Changes
  useEffect(() => {
    const sm = voiceSmRef.current;
    if (!sm) return;
    sm.updateConfig({
      mode: voiceMode,
      silenceTimeoutSec,
      wakeWordEnabled
    });
    try {
      localStorage.setItem('jobscan_voice_mode', voiceMode);
      localStorage.setItem('jobscan_silence_timeout_sec', String(silenceTimeoutSec));
      localStorage.setItem('jobscan_wake_word_enabled', String(wakeWordEnabled));
    } catch (_) {}
  }, [voiceMode, silenceTimeoutSec, wakeWordEnabled]);

  // 3. Speech Recognition Controller tied to Voice State Machine
  useEffect(() => {
    const shouldListen = voiceState === VOICE_STATES.LISTENING || voiceState === VOICE_STATES.AUTO_LISTENING;

    if (!shouldListen) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
        recognitionRef.current = null;
      }
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported on this browser.');
      voiceSmRef.current?.handleError('not-supported', 'SpeechRecognition API unavailable');
      return;
    }

    const recSessionId = voiceSmRef.current.currentSessionId;
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = aiLanguage === 'es' ? 'es-US' : aiLanguage === 'en' ? 'en-US' : (typeof navigator !== 'undefined' && navigator.language?.startsWith('es')) ? 'es-US' : 'en-US';

    rec.onresult = (e) => {
      if (voiceSmRef.current.currentSessionId !== recSessionId) return; // Stale session guard
      const spoken = e.results[0]?.[0]?.transcript || '';
      const trimmed = spoken.trim();
      if (!trimmed) return;

      // Acoustic Feedback Check
      if (voiceSmRef.current.isAcousticFeedback(trimmed)) {
        console.log('🔇 [Acoustic Feedback Suppressed]', trimmed);
        return;
      }

      // Exit Intent Check
      if (isExitIntent(trimmed)) {
        voiceSmRef.current.standDown('exit_intent_detected');
        const exitMsg = {
          sender: 'ai',
          text: 'Understood. Standing down. Tap the microphone when you need me.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages((prev) => [...prev, exitMsg]);
        speakText(exitMsg.text, trimmed);
        return;
      }

      // Normal Query or Wake-Word Processing
      const finalQuery = stripWakeWord(trimmed);
      if (finalQuery) {
        setInput(finalQuery);
        executeMessage(finalQuery);
      }
    };

    rec.onerror = (e) => {
      if (voiceSmRef.current.currentSessionId !== recSessionId) return;
      console.warn('[Speech Recognition Error]', e.error);
      voiceSmRef.current.handleError(e.error, e.message, recSessionId);
    };

    rec.onend = () => {
      if (voiceSmRef.current.currentSessionId !== recSessionId) return;
      // In PTT mode, ending recognition returns to IDLE unless thinking/speaking
      if (voiceSmRef.current.mode === VOICE_MODES.PUSH_TO_TALK && voiceSmRef.current.state === VOICE_STATES.LISTENING) {
        voiceSmRef.current.transition(VOICE_STATES.IDLE, 'rec_ended_ptt');
      }
    };

    try {
      rec.start();
      recognitionRef.current = rec;
    } catch (err) {
      console.warn('Error starting speech recognition:', err);
      voiceSmRef.current.handleError('start-failed', err.message, recSessionId);
    }

    return () => {
      try {
        rec.abort();
      } catch (_) {}
    };
  }, [voiceState, aiLanguage]);

  const handleVoiceInput = () => {
    const sm = voiceSmRef.current;
    if (!sm) return;

    if (sm.state === VOICE_STATES.SPEAKING) {
      // Barge-in interruption
      sm.bargeIn('user_tapped_mic_during_speech');
    } else if (sm.state === VOICE_STATES.LISTENING || sm.state === VOICE_STATES.AUTO_LISTENING) {
      // Toggle off / cancel listening
      sm.standDown('user_toggled_off_mic');
    } else {
      // Start listening
      sm.startListening('user_tapped_mic');
    }
  };


  return (
    <>
      {/* Persistent Floating AI Agent / Pet Button */}
      <div
        style={{
          position: 'fixed',
          bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))',
          right: 'max(16px, calc((100vw - 600px) / 2 + 16px))',
          zIndex: 2500,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <button
          onClick={() => setIsOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            backgroundColor: 'var(--color-zinc-900)',
            border: '2px solid var(--color-amber-500)',
            borderRadius: '30px',
            color: 'var(--color-zinc-100)',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.6), 0 0 12px rgba(197, 160, 89, 0.35)',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          title="Ask Adepec Field AI"
        >
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-amber-500)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#000'
            }}
          >
            <Bot size={16} />
          </div>
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-amber-500)', letterSpacing: '0.02em' }}>
            Ask AI
          </span>
        </button>
      </div>

      {/* Interactive Global AI Assistant Chat Modal */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100dvh',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: typeof window !== 'undefined' && window.innerWidth <= 640 ? '0' : '16px',
            boxSizing: 'border-box'
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '640px',
              height: typeof window !== 'undefined' && window.innerWidth <= 640 ? '100dvh' : 'min(88vh, 820px)',
              maxHeight: '100dvh',
              backgroundColor: 'var(--color-zinc-900)',
              border: typeof window !== 'undefined' && window.innerWidth <= 640 ? 'none' : '1px solid var(--color-zinc-800)',
              borderRadius: typeof window !== 'undefined' && window.innerWidth <= 640 ? '0' : '14px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8)'
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
                backgroundColor: 'var(--color-zinc-950)',
                flexShrink: 0
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
                    color: '#000',
                    flexShrink: 0
                  }}
                >
                  <Bot size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-zinc-100)', margin: 0 }}>
                    J.A.R.V.I.S. Field AI — {projectName}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--color-amber-500)', margin: 0 }}>
                      Co-Pilot
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        backgroundColor: (voiceState === VOICE_STATES.LISTENING || voiceState === VOICE_STATES.AUTO_LISTENING)
                          ? 'rgba(34, 197, 94, 0.2)'
                          : (voiceState === VOICE_STATES.SPEAKING)
                          ? 'rgba(239, 68, 68, 0.2)'
                          : (voiceState === VOICE_STATES.THINKING)
                          ? 'rgba(168, 85, 247, 0.2)'
                          : 'rgba(39, 39, 42, 0.6)',
                        color: (voiceState === VOICE_STATES.LISTENING || voiceState === VOICE_STATES.AUTO_LISTENING)
                          ? '#86efac'
                          : (voiceState === VOICE_STATES.SPEAKING)
                          ? '#fca5a5'
                          : (voiceState === VOICE_STATES.THINKING)
                          ? '#d8b4fe'
                          : 'var(--color-zinc-400)',
                        border: '1px solid ' + (
                          (voiceState === VOICE_STATES.LISTENING || voiceState === VOICE_STATES.AUTO_LISTENING)
                            ? 'rgba(34, 197, 94, 0.4)'
                            : (voiceState === VOICE_STATES.SPEAKING)
                            ? 'rgba(239, 68, 68, 0.4)'
                            : (voiceState === VOICE_STATES.THINKING)
                            ? 'rgba(168, 85, 247, 0.4)'
                            : 'var(--color-zinc-800)'
                        )
                      }}
                    >
                      {voiceState === VOICE_STATES.SPEAKING
                        ? '🔊 Speaking (Tap mic to stop)'
                        : voiceState === VOICE_STATES.AUTO_LISTENING
                        ? `🟢 Auto-Listening (${silenceRemaining}s)`
                        : voiceState === VOICE_STATES.LISTENING
                        ? `🟢 Listening... (${silenceRemaining}s)`
                        : voiceState === VOICE_STATES.THINKING
                        ? '🧠 Thinking...'
                        : '⚪ Idle'}
                    </span>
                  </div>

                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setShowActivityLog(true)}
                  style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    color: 'var(--color-amber-400)',
                    borderRadius: '6px',
                    padding: '3px 7px',
                    fontSize: '0.70rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="View AI Activity Log (queries, tools called, execution latency)"
                >
                  📋 Activity Log {activityLogs.length > 0 && `(${activityLogs.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTestSuite(true)}
                  style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    border: '1px solid #3b82f6',
                    color: '#93c5fd',
                    borderRadius: '6px',
                    padding: '3px 7px',
                    fontSize: '0.70rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Run One-Click AI Tools Diagnostic Test Suite"
                >
                  🧪 Diagnostics
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = !devMode;
                    setDevMode(next);
                    localStorage.setItem('jobscan_dev_mode', String(next));
                  }}
                  style={{
                    backgroundColor: devMode ? 'rgba(168, 85, 247, 0.2)' : 'rgba(39, 39, 42, 0.6)',
                    border: '1px solid ' + (devMode ? '#a855f7' : 'var(--color-zinc-700)'),
                    color: devMode ? '#c084fc' : 'var(--color-zinc-400)',
                    borderRadius: '6px',
                    padding: '3px 7px',
                    fontSize: '0.70rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Developer Diagnostics Mode (inspect model, intent, tools, latency)"
                >
                  🔬 {devMode ? 'DEV ON' : 'DEV'}
                </button>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  style={{ background: 'none', border: 'none', color: showSettings ? 'var(--color-amber-500)' : 'var(--color-zinc-400)', cursor: 'pointer' }}
                  title="Voice & Settings"
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
                  onClick={() => setIsOpen(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-zinc-400)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Compact Two-Tier Health Status Bar */}
            {(() => {
              const currentDash = loadProjectDashboard(projectId);
              const phasesList = currentDash?.subcontractors || currentDash?.phases || [];
              const spentTotal = currentDash?.projectInfo?.totalSpent || currentDash?.projectInfo?.drawsPaid;
              const dataLabel = spentTotal ? `${spentTotal} Spent (${phasesList.length} Phases)` : (phasesList.length > 0 ? `${phasesList.length} Phases Indexed` : 'Project Ready');
              return (
                <div
                  onClick={() => setShowTestSuite(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 14px',
                    backgroundColor: 'rgba(18, 18, 22, 0.98)',
                    borderBottom: '1px solid var(--color-zinc-800)',
                    fontSize: '0.70rem',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                  title="Click to view full Tool & Data Health breakdown"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#86efac', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                      🛠️ Tool Health: 🟢 Connected
                    </span>
                    <span style={{ color: 'var(--color-zinc-600)' }}>•</span>
                    <span style={{ color: '#93c5fd', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                      📊 Data Health: 🟢 {dataLabel}
                    </span>
                  </div>
                  <span style={{ color: 'var(--color-amber-400)', fontWeight: 700, fontSize: '0.68rem' }}>
                    Diagnostics ↗
                  </span>
                </div>
              );
            })()}

            {/* Settings Drawer */}
            {showSettings && (
              <div style={{ padding: '14px', backgroundColor: 'var(--color-zinc-950)', borderBottom: '1px solid var(--color-zinc-800)', display: 'flex', flexDirection: 'column', gap: '12px', flexShrink: 0 }}>
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
                    🎙️ J.A.R.V.I.S. Speech Synthesis Voice:
                  </label>
                  <select
                    value={selectedVoiceURI}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedVoiceURI(val);
                      const chosen = availableVoices.find((v) => v.voiceURI === val || v.name === val);
                      if (chosen) {
                        const cfg = { uri: chosen.voiceURI || '', name: chosen.name || '', lang: chosen.lang || 'en-GB' };
                        setSelectedVoiceConfig(cfg);
                        localStorage.setItem('jobscan_ai_voice_config', JSON.stringify(cfg));
                        localStorage.setItem('jobscan_ai_voice_uri', chosen.voiceURI || chosen.name || '');
                        try {
                          window.speechSynthesis.cancel();
                          const testUtt = new SpeechSynthesisUtterance('Voice updated. J.A.R.V.I.S. online.');
                          testUtt.voice = chosen;
                          testUtt.lang = chosen.lang || 'en-GB';
                          testUtt.rate = 1.2;
                          window.speechSynthesis.speak(testUtt);
                        } catch (_) {}
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--color-zinc-900)',
                      border: '1px solid var(--color-zinc-800)',
                      color: 'var(--color-zinc-100)',
                      fontSize: '0.82rem',
                      outline: 'none'
                    }}
                  >
                    {availableVoices.map((v) => (
                      <option key={v.voiceURI || v.name} value={v.voiceURI || v.name}>
                        {v.name} ({v.lang}) {v.name.includes('Natural') || v.name.includes('Google') || v.lang.includes('GB') ? '✨ Recommended' : ''}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      const chosen = availableVoices.find((v) => v.voiceURI === selectedVoiceURI || v.name === selectedVoiceURI) || resolveVoice(availableVoices, selectedVoiceConfig, false);
                      if (chosen) {
                        const cfg = { uri: chosen.voiceURI || '', name: chosen.name || '', lang: chosen.lang || 'en-GB' };
                        setSelectedVoiceConfig(cfg);
                        setSelectedVoiceURI(chosen.voiceURI || chosen.name);
                        localStorage.setItem('jobscan_ai_voice_config', JSON.stringify(cfg));
                        localStorage.setItem('jobscan_ai_voice_uri', chosen.voiceURI || chosen.name);
                        try {
                          window.speechSynthesis.cancel();
                          const testUtt = new SpeechSynthesisUtterance('J.A.R.V.I.S. voice confirmed and locked in.');
                          testUtt.voice = chosen;
                          testUtt.lang = chosen.lang || 'en-GB';
                          testUtt.rate = 1.2;
                          window.speechSynthesis.speak(testUtt);
                        } catch (_) {}
                      }
                    }}
                    style={{
                      width: '100%',
                      marginTop: '8px',
                      padding: '7px 12px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      backgroundColor: 'rgba(245, 158, 11, 0.15)',
                      color: 'var(--color-amber-400)',
                      border: '1px solid var(--color-amber-500)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    🔊 Save & Test Voice
                  </button>
                </div>

                {/* Continuous Hands-Free & Wake-Word Settings */}
                <div style={{ borderTop: '1px dashed var(--color-zinc-800)', paddingTop: '10px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-amber-400)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    🎙️ Voice Conversation & Microphone Loop
                  </div>

                  {/* Mode Selector */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setVoiceMode(VOICE_MODES.PUSH_TO_TALK)}
                      style={{
                        padding: '7px 6px',
                        borderRadius: '6px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        backgroundColor: voiceMode === VOICE_MODES.PUSH_TO_TALK ? 'var(--color-amber-500)' : 'var(--color-zinc-900)',
                        color: voiceMode === VOICE_MODES.PUSH_TO_TALK ? '#000' : 'var(--color-zinc-300)',
                        border: voiceMode === VOICE_MODES.PUSH_TO_TALK ? '1px solid var(--color-amber-500)' : '1px solid var(--color-zinc-800)',
                        cursor: 'pointer'
                      }}
                    >
                      ✋ Push-to-Talk
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoiceMode(VOICE_MODES.CONTINUOUS_HANDS_FREE)}
                      style={{
                        padding: '7px 6px',
                        borderRadius: '6px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        backgroundColor: voiceMode === VOICE_MODES.CONTINUOUS_HANDS_FREE ? '#22c55e' : 'var(--color-zinc-900)',
                        color: voiceMode === VOICE_MODES.CONTINUOUS_HANDS_FREE ? '#000' : 'var(--color-zinc-300)',
                        border: voiceMode === VOICE_MODES.CONTINUOUS_HANDS_FREE ? '1px solid #22c55e' : '1px solid var(--color-zinc-800)',
                        cursor: 'pointer'
                      }}
                    >
                      🎙️ Continuous Hands-Free
                    </button>
                  </div>

                  {/* Silence Timeout Slider */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--color-zinc-300)', marginBottom: '3px' }}>
                      <span>⏳ Silence Timeout (Auto Stand-down):</span>
                      <strong style={{ color: 'var(--color-amber-400)' }}>{silenceTimeoutSec} seconds</strong>
                    </div>
                    <input
                      type="range"
                      min="4"
                      max="15"
                      step="1"
                      value={silenceTimeoutSec}
                      onChange={(e) => setSilenceTimeoutSec(parseInt(e.target.value, 10))}
                      style={{ width: '100%', accentColor: 'var(--color-amber-500)' }}
                    />
                  </div>

                  {/* Wake-Word Toggle */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.74rem', color: 'var(--color-zinc-200)', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={wakeWordEnabled}
                      onChange={(e) => setWakeWordEnabled(e.target.checked)}
                      style={{ accentColor: 'var(--color-amber-500)', width: '15px', height: '15px' }}
                    />
                    <span>Enable Wake-Word Detection (<strong>"Hey Jarvis"</strong> / <strong>"Jarvis"</strong>)</span>
                  </label>
                </div>
              </div>
            )}


            {/* Chat Messages */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              {messages.map((m, idx) => {
                const isUser = m.sender === 'user';
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: isUser ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '85%',
                        padding: '10px 14px',
                        borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                        backgroundColor: isUser ? 'var(--color-amber-500)' : 'var(--color-zinc-800)',
                        color: isUser ? '#000' : 'var(--color-zinc-100)',
                        fontSize: '0.88rem',
                        lineHeight: '1.45',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                      }}
                    >
                      <div style={{ whiteSpace: 'pre-wrap' }}>{isUser ? m.text : formatMessageDisplay(m.text)}</div>


                      {/* Developer Diagnostics Telemetry Panel */}
                      {devMode && m.telemetry && (
                        <div
                          style={{
                            marginTop: '8px',
                            borderTop: '1px dashed rgba(255, 255, 255, 0.15)',
                            paddingTop: '6px',
                            fontSize: '0.72rem'
                          }}
                        >
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ backgroundColor: 'rgba(168, 85, 247, 0.2)', color: '#d8b4fe', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                              🤖 {m.telemetry.modelUsed || 'gemini-3.6-flash'}
                            </span>
                            <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                              🎯 {m.telemetry.intent || 'Standard Lookup'}
                            </span>
                            {m.telemetry.durationMs !== undefined && (
                              <span style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#86efac', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                ⏱️ {m.telemetry.durationMs}ms
                              </span>
                            )}
                          </div>

                          {/* Sources Used Banner */}
                          {m.telemetry.sourcesUsed && m.telemetry.sourcesUsed.length > 0 && (
                            <div style={{ margin: '4px 0', fontSize: '0.70rem', color: '#fef08a', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 800 }}>📚 Sources:</span>
                              {m.telemetry.sourcesUsed.map((src, sIdx) => (
                                <span key={sIdx} style={{ backgroundColor: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.3)', padding: '1px 5px', borderRadius: '3px', color: '#fde047', fontWeight: 600 }}>
                                  {src.includes('Sheets') ? '📊 ' : src.includes('Memory') ? '🧠 ' : src.includes('Drive') ? '📁 ' : '⚡ '}
                                  {src}
                                </span>
                              ))}
                            </div>
                          )}

                          {m.telemetry.toolsExecuted && m.telemetry.toolsExecuted.length > 0 ? (
                            <div style={{ marginTop: '5px', backgroundColor: 'rgba(0, 0, 0, 0.45)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                              <div style={{ fontWeight: 800, color: 'var(--color-amber-400)', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                🛠️ Tools Called ({m.telemetry.toolsExecuted.length}):
                              </div>
                              {m.telemetry.toolsExecuted.map((t, tIdx) => (
                                <div key={tIdx} style={{ fontSize: '0.70rem', fontFamily: 'monospace', marginTop: '3px', paddingBottom: '3px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#67e8f9', fontWeight: 700 }}>⚡ {t.name}</span>
                                    {t.result?._executionDurationMs !== undefined && (
                                      <span style={{ color: '#86efac' }}>{t.result._executionDurationMs}ms</span>
                                    )}
                                  </div>
                                  <div style={{ color: 'var(--color-zinc-400)' }}>Args: {JSON.stringify(t.args || {})}</div>
                                  {t.result && (
                                    <div style={{ color: '#a7f3d0', marginTop: '2px', fontSize: '0.68rem' }}>
                                      Result: {t.result.results ? `${t.result.results.length} records found` : t.result.count ? `${t.result.count} receipts` : t.result.status || t.result.location || JSON.stringify(t.result).slice(0, 60) + '...'}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.68rem', color: 'var(--color-zinc-400)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {m.telemetry.memoriesGroundedCount > 0 ? (
                                <span style={{ color: '#a7f3d0' }}>
                                  🧠 Memory Vault: {m.telemetry.memoriesGroundedCount} persistent memory retrieved from Firestore
                                </span>
                              ) : (
                                <span>ℹ️ Grounded directly from live data manifest.</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Interactive Document & Receipt Viewer Cards */}
                      {m.viewFiles && m.viewFiles.length > 0 && (
                        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {m.viewFiles.map((vf, vIdx) => (
                            <div
                              key={vIdx}
                              style={{
                                backgroundColor: 'rgba(0, 0, 0, 0.45)',
                                border: '1px solid rgba(245, 158, 11, 0.5)',
                                borderRadius: '8px',
                                padding: '10px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FileText size={18} style={{ color: 'var(--color-amber-400)', flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {vf.fileName}
                                  </div>
                                  {vf.folderName && (
                                    <div style={{ fontSize: '0.70rem', color: 'var(--color-zinc-400)' }}>
                                      📁 {vf.folderName}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenDocumentPreview(vf)}
                                  style={{
                                    flex: 1,
                                    padding: '7px 10px',
                                    backgroundColor: 'var(--color-amber-500)',
                                    color: '#000',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontWeight: 800,
                                    fontSize: '0.78rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '5px'
                                  }}
                                >
                                  <Eye size={14} /> Tap to View Full Screen
                                </button>
                                <a
                                  href={`https://drive.google.com/file/d/${vf.fileId}/view`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    padding: '7px 10px',
                                    backgroundColor: 'var(--color-zinc-900)',
                                    color: 'var(--color-zinc-300)',
                                    border: '1px solid var(--color-zinc-700)',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    textDecoration: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  <ExternalLink size={13} /> Drive
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div
                        style={{
                          fontSize: '0.68rem',
                          color: isUser ? 'rgba(0, 0, 0, 0.6)' : 'var(--color-zinc-400)',
                          textAlign: 'right',
                          marginTop: '4px'
                        }}
                      >
                        {m.timestamp}
                      </div>
                    </div>
                  </div>
                );
              })}

              {isLoading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '12px 12px 12px 2px',
                      backgroundColor: 'var(--color-zinc-800)',
                      color: 'var(--color-amber-500)',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Loader2 size={16} className="spin-animation" />
                    <span>J.A.R.V.I.S. is thinking...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Live Voice State Active Bar */}
            {(voiceState !== VOICE_STATES.IDLE) && (
              <div
                style={{
                  padding: '8px 16px',
                  backgroundColor: (voiceState === VOICE_STATES.LISTENING || voiceState === VOICE_STATES.AUTO_LISTENING)
                    ? 'rgba(34, 197, 94, 0.15)'
                    : (voiceState === VOICE_STATES.SPEAKING)
                    ? 'rgba(239, 68, 68, 0.15)'
                    : 'rgba(168, 85, 247, 0.15)',
                  borderTop: '1px solid ' + (
                    (voiceState === VOICE_STATES.LISTENING || voiceState === VOICE_STATES.AUTO_LISTENING)
                      ? 'rgba(34, 197, 94, 0.3)'
                      : (voiceState === VOICE_STATES.SPEAKING)
                      ? 'rgba(239, 68, 68, 0.3)'
                      : 'rgba(168, 85, 247, 0.3)'
                  ),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  flexShrink: 0
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <div
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: (voiceState === VOICE_STATES.LISTENING || voiceState === VOICE_STATES.AUTO_LISTENING)
                        ? '#22c55e'
                        : (voiceState === VOICE_STATES.SPEAKING)
                        ? '#ef4444'
                        : '#a855f7',
                      animation: 'pulse 1.2s infinite'
                    }}
                  />
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      color: (voiceState === VOICE_STATES.LISTENING || voiceState === VOICE_STATES.AUTO_LISTENING)
                        ? '#86efac'
                        : (voiceState === VOICE_STATES.SPEAKING)
                        ? '#fca5a5'
                        : '#d8b4fe',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {voiceState === VOICE_STATES.AUTO_LISTENING
                      ? `🎙️ Hands-Free Listening: Speak now (${silenceRemaining}s remaining)...`
                      : voiceState === VOICE_STATES.LISTENING
                      ? '🎙️ Listening... Speak your question now'
                      : voiceState === VOICE_STATES.SPEAKING
                      ? '🔊 Jarvis is speaking... (Tap Interrupt to stop)'
                      : '🧠 Jarvis is processing...'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (voiceState === VOICE_STATES.SPEAKING) {
                      voiceSmRef.current?.bargeIn('user_clicked_banner_interrupt');
                    } else {
                      voiceSmRef.current?.standDown('user_clicked_banner_cancel');
                    }
                  }}
                  style={{
                    padding: '3px 8px',
                    backgroundColor: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '4px',
                    color: '#fff',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  {voiceState === VOICE_STATES.SPEAKING ? '⏹ Interrupt' : '✕ Stand Down'}
                </button>
              </div>
            )}

            {/* Input Bar */}
            <form
              onSubmit={handleSendMessage}
              style={{
                padding: '10px 12px',
                paddingBottom: 'max(14px, env(safe-area-inset-bottom, 14px))',
                backgroundColor: 'var(--color-zinc-950)',
                borderTop: '1px solid var(--color-zinc-800)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexShrink: 0,
                width: '100%',
                boxSizing: 'border-box'
              }}
            >

              <button
                type="button"
                onClick={() => {
                  const nextMode = voiceMode === VOICE_MODES.CONTINUOUS_HANDS_FREE ? VOICE_MODES.PUSH_TO_TALK : VOICE_MODES.CONTINUOUS_HANDS_FREE;
                  setVoiceMode(nextMode);
                }}
                style={{
                  height: '44px',
                  padding: '0 8px',
                  backgroundColor: voiceMode === VOICE_MODES.CONTINUOUS_HANDS_FREE ? 'rgba(34, 197, 94, 0.18)' : 'rgba(39, 39, 42, 0.6)',
                  border: '1px solid ' + (voiceMode === VOICE_MODES.CONTINUOUS_HANDS_FREE ? '#22c55e' : 'var(--color-zinc-700)'),
                  color: voiceMode === VOICE_MODES.CONTINUOUS_HANDS_FREE ? '#86efac' : 'var(--color-zinc-400)',
                  borderRadius: '8px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
                title="Toggle Hands-Free Voice Mode (Automatically listens after Jarvis answers)"
              >
                {voiceMode === VOICE_MODES.CONTINUOUS_HANDS_FREE ? '🎙️ Auto' : '✋ PTT'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = aiLanguage === 'es' ? 'en' : 'es';
                  setAiLanguage(next);
                  localStorage.setItem('jobscan_ai_lang', next);
                }}
                style={{
                  height: '44px',
                  padding: '0 8px',
                  backgroundColor: aiLanguage === 'es' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid ' + (aiLanguage === 'es' ? '#22c55e' : '#3b82f6'),
                  color: aiLanguage === 'es' ? '#86efac' : '#93c5fd',
                  borderRadius: '8px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
                title="Click to toggle Mic Language (English / Español)"
              >
                {aiLanguage === 'es' ? '🇲🇽 ES' : '🇺🇸 EN'}
              </button>
              <button
                type="button"
                onClick={handleVoiceInput}
                style={{
                  height: '44px',
                  minWidth: '44px',
                  padding: '0 10px',
                  backgroundColor: (voiceState === VOICE_STATES.LISTENING || voiceState === VOICE_STATES.AUTO_LISTENING)
                    ? 'rgba(34, 197, 94, 0.25)'
                    : (voiceState === VOICE_STATES.SPEAKING)
                    ? 'rgba(239, 68, 68, 0.25)'
                    : 'rgba(197, 160, 89, 0.15)',
                  border: '1px solid ' + (
                    (voiceState === VOICE_STATES.LISTENING || voiceState === VOICE_STATES.AUTO_LISTENING)
                      ? '#22c55e'
                      : (voiceState === VOICE_STATES.SPEAKING)
                      ? '#ef4444'
                      : 'var(--color-amber-500)'
                  ),
                  color: (voiceState === VOICE_STATES.LISTENING || voiceState === VOICE_STATES.AUTO_LISTENING)
                    ? '#86efac'
                    : (voiceState === VOICE_STATES.SPEAKING)
                    ? '#fca5a5'
                    : 'var(--color-amber-500)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  flexShrink: 0,
                  boxShadow: (voiceState === VOICE_STATES.LISTENING || voiceState === VOICE_STATES.AUTO_LISTENING)
                    ? '0 0 10px rgba(34, 197, 94, 0.4)'
                    : 'none'
                }}
                title={
                  voiceState === VOICE_STATES.SPEAKING
                    ? 'Tap to Interrupt (Barge-In)'
                    : voiceState === VOICE_STATES.AUTO_LISTENING
                    ? `Hands-Free Listening (${silenceRemaining}s)`
                    : isRecording
                    ? 'Listening...'
                    : 'Voice Dictation (Mic)'
                }
              >
                {voiceState === VOICE_STATES.SPEAKING ? (
                  <>
                    <Square size={14} fill="#fca5a5" />
                    <span style={{ fontSize: '0.70rem', fontWeight: 800 }}>Stop</span>
                  </>
                ) : (voiceState === VOICE_STATES.LISTENING || voiceState === VOICE_STATES.AUTO_LISTENING) ? (
                  <>
                    <Mic size={16} />
                    <span style={{ fontSize: '0.70rem', fontWeight: 800 }}>{silenceRemaining}s</span>
                  </>
                ) : (
                  <Mic size={18} />
                )}
              </button>

              <input
                type="text"
                placeholder={aiLanguage === 'es' ? 'Pregunta en Español: "¿Cuánto balance con el pintor?"...' : 'Ask J.A.R.V.I.S. in English or Spanish...'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: '44px',
                  backgroundColor: 'var(--color-zinc-950)',
                  border: '1px solid var(--color-zinc-800)',
                  borderRadius: '8px',
                  padding: '0 12px',
                  color: 'var(--color-zinc-100)',
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="submit"
                disabled={isLoading}
                style={{
                  height: '44px',
                  minWidth: '44px',
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
                  justifyContent: 'center',
                  gap: '4px',
                  flexShrink: 0
                }}
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Provider-Agnostic, Capability-Driven Document Viewer Modal */}
      {activePreviewFile && (
        <DocumentViewerModal
          file={activePreviewFile}
          token={googleToken}
          onClose={() => setActivePreviewFile(null)}
        />
      )}


      {/* Two-Tier Health & AI Diagnostic Suite Modal */}
      {showTestSuite && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100001,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backdropFilter: 'blur(8px)'
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '700px',
              maxHeight: '92vh',
              backgroundColor: 'var(--color-zinc-950)',
              border: '1px solid var(--color-zinc-800)',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
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
                backgroundColor: 'rgba(24, 24, 27, 0.6)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.3rem' }}>🧪</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: 'var(--color-zinc-100)' }}>
                    System Diagnostics & Health Suite
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-zinc-400)' }}>
                    Two-Tier health classification & one-click live tool testing
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTestSuite(false)}
                style={{ background: 'none', border: 'none', color: 'var(--color-zinc-400)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Action Banner */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--color-zinc-900)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--color-zinc-800)' }}>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-zinc-200)' }}>
                    Active Project: <span style={{ color: 'var(--color-amber-400)' }}>{projectName}</span>
                  </div>
                  <div style={{ fontSize: '0.70rem', color: 'var(--color-zinc-400)' }}>
                    Model: <code style={{ color: '#86efac' }}>gemini-3.5-flash (GA Stable)</code>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRunDiagnosticSuite}
                  disabled={isRunningTests}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: isRunningTests ? 'var(--color-zinc-800)' : 'var(--color-amber-500)',
                    color: isRunningTests ? 'var(--color-zinc-400)' : '#000',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    cursor: isRunningTests ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {isRunningTests ? <Loader2 size={16} className="animate-spin" /> : '▶'}
                  {isRunningTests ? 'Running Checks...' : '▶ Run Diagnostic Suite'}
                </button>
              </div>

              {/* Two-Tier Health Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                
                {/* 1. Tool / API Infrastructure Health */}
                <div style={{ backgroundColor: 'var(--color-zinc-900)', border: '1px solid var(--color-zinc-800)', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#86efac', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    🛠️ Tool & API Infrastructure
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(testSuiteData?.health?.toolHealth || [
                      { name: 'Open-Meteo Weather API', badge: '🟢 Operational', detail: 'REST Endpoint Active' },
                      { name: 'Gemini Brain Engine', badge: '🟢 Operational', detail: 'gemini-3.5-flash (GA Stable)' },
                      { name: 'Google Drive API', badge: googleToken ? '🟢 Authenticated' : '🟡 Offline Cache', detail: googleToken ? 'OAuth2 Bearer Token Valid' : 'Using Local Storage Drive Cache' },
                      { name: 'Sheets Ledger Engine', badge: '🟢 Operational', detail: 'Category Router Active' }
                    ]).map((t, idx) => (
                      <div key={idx} style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '6px 8px', borderRadius: '6px', fontSize: '0.72rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                          <span style={{ color: '#fff' }}>{t.name}</span>
                          <span>{t.badge}</span>
                        </div>
                        <div style={{ color: 'var(--color-zinc-400)', fontSize: '0.66rem', marginTop: '2px' }}>{t.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Project Data Health */}
                <div style={{ backgroundColor: 'var(--color-zinc-900)', border: '1px solid var(--color-zinc-800)', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#93c5fd', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    📊 Project Data Health
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(testSuiteData?.health?.dataHealth || [
                      { name: 'Subcontractor Ledger', badge: '🟢 Ledger Ready', detail: 'Phase contract and quote data' },
                      { name: 'Receipts & Transactions', badge: '🟢 Records Indexed', detail: 'Payment attachments and logs' },
                      { name: 'Drive Document Tree', badge: driveTree?.subfolders?.length ? `🟢 ${driveTree.subfolders.length} Folders` : '🟡 No Files Indexed', detail: 'Blueprint and spec files' },
                      { name: 'Finish Specs', badge: loadProjectSpecs(projectId)?.length ? `🟢 ${loadProjectSpecs(projectId).length} Specs` : '🟡 0 Specs Configured', detail: 'Paint and material selections' }
                    ]).map((d, idx) => (
                      <div key={idx} style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '6px 8px', borderRadius: '6px', fontSize: '0.72rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                          <span style={{ color: '#fff' }}>{d.name}</span>
                          <span>{d.badge}</span>
                        </div>
                        <div style={{ color: 'var(--color-zinc-400)', fontSize: '0.66rem', marginTop: '2px' }}>{d.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* 3. Live One-Click Tool Execution Results */}
              {testSuiteData?.testResults && (
                <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-amber-400)' }}>
                    🧪 Live Tool Endpoint Test Results ({testSuiteData.testResults.length})
                  </div>
                  {testSuiteData.testResults.map((t, idx) => (
                    <div
                      key={idx}
                      style={{
                        backgroundColor: 'var(--color-zinc-900)',
                        border: '1px solid ' + (t.passed ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'),
                        borderRadius: '8px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '5px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.95rem' }}>{t.passed ? '🟢' : '🔴'}</span>
                          <span style={{ fontWeight: 800, fontSize: '0.84rem', color: '#fff' }}>{t.title}</span>
                          <code style={{ fontSize: '0.70rem', color: '#67e8f9', backgroundColor: 'rgba(0,0,0,0.4)', padding: '2px 5px', borderRadius: '4px' }}>
                            {t.tool}
                          </code>
                        </div>
                        <span style={{ fontSize: '0.72rem', color: '#86efac', fontWeight: 700 }}>
                          ⏱️ {t.durationMs}ms
                        </span>
                      </div>

                      <div style={{ fontSize: '0.70rem', color: 'var(--color-zinc-400)', fontFamily: 'monospace' }}>
                        Args: {JSON.stringify(t.args)}
                      </div>

                      <details style={{ marginTop: '2px' }}>
                        <summary style={{ fontSize: '0.70rem', color: 'var(--color-amber-400)', cursor: 'pointer', fontWeight: 700 }}>
                          View Raw Returned Payload
                        </summary>
                        <pre style={{ margin: '6px 0 0 0', padding: '8px', backgroundColor: '#000', borderRadius: '6px', fontSize: '0.68rem', color: '#a7f3d0', overflowX: 'auto' }}>
                          {JSON.stringify(t.payload, null, 2)}
                        </pre>
                      </details>
                    </div>
                  ))}
                </div>
              )}

              {!testSuiteData && !isRunningTests && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-zinc-500)', fontSize: '0.82rem' }}>
                  Click <strong>"▶ Run Diagnostic Suite"</strong> to test all tool endpoints with live data.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Activity Log Drawer / Modal */}
      {showActivityLog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100001,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backdropFilter: 'blur(8px)'
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '750px',
              maxHeight: '92vh',
              backgroundColor: 'var(--color-zinc-950)',
              border: '1px solid var(--color-zinc-800)',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
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
                backgroundColor: 'rgba(24, 24, 27, 0.6)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.3rem' }}>📋</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: 'var(--color-zinc-100)' }}>
                    AI Activity Log ({activityLogs.length} interactions)
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-zinc-400)' }}>
                    History of models, tools called, input arguments, latency, and results
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {activityLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setActivityLogs([]);
                      localStorage.removeItem('jobscan_ai_activity_logs');
                    }}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#f87171',
                      borderRadius: '6px',
                      fontSize: '0.70rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Clear History
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowActivityLog(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-zinc-400)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {activityLogs.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-zinc-500)', fontSize: '0.85rem' }}>
                  No AI interactions logged yet in this session. Ask a question in chat to record activity.
                </div>
              ) : (
                activityLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      backgroundColor: 'var(--color-zinc-900)',
                      border: '1px solid var(--color-zinc-800)',
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--color-zinc-100)' }}>
                        💬 "{log.query}"
                      </span>
                      <span style={{ fontSize: '0.70rem', color: 'var(--color-zinc-400)' }}>
                        {log.timestamp}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                      <span style={{
                        backgroundColor: log.source === 'Local Tool Data' ? 'rgba(16, 185, 129, 0.2)' : (log.source === 'Local Project Ledger' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(168, 85, 247, 0.2)'),
                        color: log.source === 'Local Tool Data' ? '#6ee7b7' : (log.source === 'Local Project Ledger' ? '#67e8f9' : '#d8b4fe'),
                        border: `1px solid ${log.source === 'Local Tool Data' ? 'rgba(16, 185, 129, 0.4)' : (log.source === 'Local Project Ledger' ? 'rgba(6, 182, 212, 0.4)' : 'rgba(168, 85, 247, 0.4)')}`,
                        padding: '2px 7px',
                        borderRadius: '4px',
                        fontSize: '0.70rem',
                        fontWeight: 800
                      }}>
                        {log.source === 'Local Tool Data' ? '⚡ Source: Local Tool Data' : (log.source === 'Local Project Ledger' ? '📁 Source: Local Project Ledger' : '🤖 Source: Gemini Cloud AI')}
                      </span>
                      <span style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)', color: 'var(--color-zinc-300)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.70rem', fontWeight: 600 }}>
                        {log.modelUsed}
                      </span>
                      <span style={{ backgroundColor: log.httpStatus === '200 OK' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: log.httpStatus === '200 OK' ? '#86efac' : '#fca5a5', padding: '2px 6px', borderRadius: '4px', fontSize: '0.70rem', fontWeight: 700 }}>
                        📡 {log.httpStatus || '200 OK'}
                      </span>
                      <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', padding: '2px 6px', borderRadius: '4px', fontSize: '0.70rem', fontWeight: 600 }}>
                        🎯 {log.intent}
                      </span>
                      <span style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#86efac', padding: '2px 6px', borderRadius: '4px', fontSize: '0.70rem', fontWeight: 600 }}>
                        ⏱️ {log.durationMs}ms
                      </span>
                    </div>


                    {/* Tools Invoked & Data Returned */}
                    {log.toolsExecuted && log.toolsExecuted.length > 0 && (
                      <div style={{ backgroundColor: 'rgba(0,0,0,0.4)', padding: '8px', borderRadius: '6px', marginTop: '4px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-amber-400)', marginBottom: '4px' }}>
                          🛠️ Tools Invoked ({log.toolsExecuted.length}):
                        </div>
                        {log.toolsExecuted.map((t, tIdx) => (
                          <div key={tIdx} style={{ fontSize: '0.70rem', fontFamily: 'monospace', color: 'var(--color-zinc-300)', marginTop: '4px', paddingBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ color: '#67e8f9', fontWeight: 700 }}>⚡ {t.name}</span>
                              <span style={{ color: 'var(--color-zinc-400)' }}>Args: {JSON.stringify(t.args || {})}</span>
                            </div>
                            {t.result && (
                              <details style={{ marginTop: '3px' }}>
                                <summary style={{ color: '#a7f3d0', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 600 }}>
                                  View Data Returned from Sheet/Cache ▾
                                </summary>
                                <pre style={{ margin: '4px 0 0 0', padding: '6px', backgroundColor: '#000', borderRadius: '4px', fontSize: '0.65rem', color: '#86efac', overflowX: 'auto' }}>
                                  {JSON.stringify(t.result, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Final Synthesized Answer */}
                    <div style={{ fontSize: '0.74rem', color: 'var(--color-zinc-200)', backgroundColor: 'rgba(255,255,255,0.04)', padding: '8px', borderRadius: '6px', marginTop: '2px', borderLeft: '3px solid var(--color-amber-400)' }}>
                      <div style={{ color: 'var(--color-amber-400)', fontWeight: 800, fontSize: '0.70rem', marginBottom: '2px' }}>Final Synthesized Answer:</div>
                      {log.finalAnswer || log.resultSummary}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </>
  );
}

