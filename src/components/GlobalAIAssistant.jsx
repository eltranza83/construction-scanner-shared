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
  MessageSquare,
  Loader2,
  FileText,
  ExternalLink,
  Eye,
  Download
} from 'lucide-react';
import {
  loadProjectSpecs,
  saveProjectSpecs,
  askGeminiBrain,
  loadProjectDriveTree,
  saveProjectDriveTree
} from '../services/builderBrainService';
import {
  fetchProjectDriveTree,
  createFolder,
  trashDriveFileOrFolder,
  syncFinishSpecsToDrive,
  fetchDriveFileBase64,
  fetchDriveFileAsObjectUrl
} from '../services/googleDrive';

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

  return null;
};

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
  const [selectedVoiceURI, setSelectedVoiceURI] = useState('');
  const [aiLanguage, setAiLanguage] = useState(() => localStorage.getItem('jobscan_ai_lang') || 'auto');
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('jobscan_gemini_api_key') || localStorage.getItem('jobscan_gemini_key') || '');
  const [driveTree, setDriveTree] = useState(() => loadProjectDriveTree(projectId));
  const [previewDoc, setPreviewDoc] = useState({
    isOpen: false,
    fileId: '',
    fileName: '',
    folderName: '',
    objectUrl: '',
    isLoading: false,
    error: ''
  });
  const chatEndRef = useRef(null);

  const handleOpenDocumentPreview = async (fileObj) => {
    if (!fileObj || !fileObj.fileId) return;
    setPreviewDoc({
      isOpen: true,
      fileId: fileObj.fileId,
      fileName: fileObj.fileName || 'Document Preview',
      folderName: fileObj.folderName || 'Google Drive',
      objectUrl: '',
      isLoading: true,
      error: ''
    });

    try {
      if (googleToken) {
        const url = await fetchDriveFileAsObjectUrl(googleToken, fileObj.fileId);
        setPreviewDoc((prev) => ({ ...prev, objectUrl: url, isLoading: false }));
      } else {
        window.open(`https://drive.google.com/file/d/${fileObj.fileId}/view`, '_blank');
        setPreviewDoc({ isOpen: false, fileId: '', fileName: '', folderName: '', objectUrl: '', isLoading: false, error: '' });
      }
    } catch (err) {
      console.warn('Error fetching preview doc:', err);
      setPreviewDoc((prev) => ({ ...prev, isLoading: false, error: 'Could not load document preview directly from Drive.' }));
    }
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



  const getBestBritishMaleVoice = (voices, explicitURI) => {
    if (!voices || voices.length === 0) return null;
    if (explicitURI) {
      const chosen = voices.find((v) => v.voiceURI === explicitURI);
      if (chosen) return chosen;
    }
    const femaleNames = ['Susan', 'Hazel', 'Victoria', 'Zira', 'Samantha', 'Karen', 'Serena', 'Kate', 'Stephanie', 'Martha', 'Female', 'en-gb-x-gba', 'en-gb-x-gbd', 'en-gb-x-gbf'];

    // Platform Priority 1: Windows (Microsoft George / Natural)
    const msGeorge = voices.find((v) => (v.lang.startsWith('en-GB') || v.lang === 'en-GB') && v.name.includes('George'));
    if (msGeorge) return msGeorge;

    // Platform Priority 2: Apple iOS/macOS (Daniel, Oliver, Arthur)
    const appleMale = voices.find(
      (v) => (v.lang.startsWith('en-GB') || v.lang === 'en-GB') && (v.name.includes('Daniel') || v.name.includes('Oliver') || v.name.includes('Arthur'))
    );
    if (appleMale) return appleMale;

    // Platform Priority 3: Google Android / Chrome (Google UK English Male, en-gb-x-rjs, en-gb-x-gbb)
    const googleUkMale = voices.find(
      (v) => (v.lang.startsWith('en-GB') || v.lang === 'en-GB') && (v.name.includes('UK English Male') || v.name.includes('rjs') || v.name.includes('gbb'))
    );
    if (googleUkMale) return googleUkMale;

    // Platform Priority 4: Any UK voice with 'Male'
    const anyUkMale = voices.find((v) => (v.lang.startsWith('en-GB') || v.lang === 'en-GB') && v.name.toLowerCase().includes('male'));
    if (anyUkMale) return anyUkMale;

    // Platform Priority 5: Any non-blacklisted en-GB voice
    const safeUk = voices.find(
      (v) => (v.lang.startsWith('en-GB') || v.lang === 'en-GB') && !femaleNames.some((f) => v.name.includes(f))
    );
    if (safeUk) return safeUk;

    // Platform Priority 6: Any general English male voice
    const generalMale = voices.find(
      (v) => v.lang.startsWith('en') && (v.name.includes('George') || v.name.includes('Daniel') || v.name.includes('Oliver') || v.name.includes('Arthur') || v.name.includes('David') || v.name.includes('Guy'))
    );
    if (generalMale) return generalMale;

    return voices.find((v) => v.lang.startsWith('en-GB')) || voices.find((v) => v.lang.startsWith('en')) || voices[0];
  };

  const getBestSpanishMaleVoice = (voices, explicitURI) => {
    if (!voices || voices.length === 0) return null;
    if (explicitURI) {
      const chosen = voices.find((v) => v.voiceURI === explicitURI && v.lang.startsWith('es'));
      if (chosen) return chosen;
    }
    const femaleNames = ['Sabina', 'Dalia', 'Paulina', 'Helena', 'Laura', 'Monica', 'Female', 'es-es-x-eea'];
    const maleNames = ['Jorge', 'Raul', 'Pablo', 'Carlos', 'Alvaro', 'Enrique', 'Male', 'rjs'];
    const maleEs = voices.find((v) => v.lang.startsWith('es') && maleNames.some((m) => v.name.includes(m)));
    if (maleEs) return maleEs;
    const safeEs = voices.find((v) => v.lang.startsWith('es') && !femaleNames.some((f) => v.name.includes(f)));
    if (safeEs) return safeEs;
    return voices.find((v) => v.lang.startsWith('es')) || null;
  };

  // Load natural voices (English + Spanish) with J.A.R.V.I.S. British English priority
  useEffect(() => {
    const loadVoices = () => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en') || v.lang.startsWith('es'));
        setAvailableVoices(voices);
        const bestDefault = getBestBritishMaleVoice(voices, null);
        if (bestDefault && !selectedVoiceURI) {
          setSelectedVoiceURI(bestDefault.voiceURI);
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

  const speakText = (text) => {
    if (!speechEnabled || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      let clean = text;

      // If the response is a numbered file list or bullet list of items, stop speaking before reading all list items
      if (/\n\s*(1[\.\)]|[-•])\s+/m.test(clean) && /(here is the list|here's the list|here are the files|files in there|here they are|aquí está la lista|aqui esta la lista)/i.test(clean)) {
        clean = clean.split(/\n\s*(1[\.\)]|[-•])\s+/m)[0];
      }

      clean = clean.replace(/[*_#🚨⏰👷📍•`]/g, '').replace(/[\[\]]/g, '').replace(/\n+/g, '. ');
      // Strip raw file extensions and underscores from voice readout so it doesn't sound robotic
      clean = clean.replace(/\.pdf\b/gi, '').replace(/\.txt\b/gi, '').replace(/\.docx?\b/gi, '').replace(/[_\-]+/g, ' ');
      // Strip commas before and after 'Sir' / 'Señor' so speech synthesis doesn't insert an awkward dramatic pause
      clean = clean.replace(/,\s*(sir\b|señor\b)/gi, ' $1').replace(/\b(sir|señor)\s*,/gi, '$1 ');

      const utterance = new SpeechSynthesisUtterance(clean.trim());
      utterance.rate = 1.20; // Brisk, energetic executive cadence
      utterance.pitch = 1.0; // Natural, clean pitch

      const isSpanish = /[áéíóúüñ¿¡]/i.test(text) || /\b(el|la|los|las|un|una|del|por|para|con|este|esta|lote|plomero|electricista|dinero|gastado|cuanto|quien|recordatorio|buenos|dias|tardes|hola|subcontratista|factura|presupuesto)\b/i.test(text);

      if (isSpanish || aiLanguage === 'es') {
        utterance.lang = 'es-US';
        const spanishVoice = getBestSpanishMaleVoice(availableVoices, selectedVoiceURI);
        if (spanishVoice) utterance.voice = spanishVoice;
      } else {
        utterance.lang = 'en-GB';
        const britishVoice = getBestBritishMaleVoice(availableVoices, selectedVoiceURI);
        if (britishVoice) utterance.voice = britishVoice;
      }
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
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
      let fileAttachment = null;
      const targetFile = findReferencedDriveFile(query, driveTree, messages);
      if (targetFile && targetFile.id && googleToken) {
        try {
          fileAttachment = await fetchDriveFileBase64(googleToken, targetFile.id);
        } catch (fileErr) {
          console.warn('Drive file fetch attachment warning:', fileErr);
        }
      }

      const answer = await askGeminiBrain(query, [], projectName, apiKey, null, projectId, messages, driveTree, fileAttachment);

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

      // Only attach a preview card when the user EXPLICITLY asks to view, open, pull up, fetch, or show a specific file
      const isExplicitViewCommand =
        /^(can you\s+)?(show|open|pull up|fetch|view|display|let me see)\b/i.test(query.trim()) ||
        /\b(pull it up|open it|show it|view it|let me view it|view this file|open this file|show this file|let me see it)\b/i.test(query.trim());

      if (targetFile && targetFile.id && viewFiles.length === 0 && isExplicitViewCommand) {
        viewFiles.push({
          fileId: targetFile.id,
          fileName: targetFile.name,
          folderName: targetFile.folderName || 'Google Drive'
        });
      }

      // Smart Turn Pacer: Strict 4-to-5 question cadence for "Sir" / "Señor"
      const totalUserQuestions = messages.filter((m) => m.sender === 'user').length + 1;
      const isGreetingTurn = totalUserQuestions === 1 && /^(hello|hi|hey|good morning|good afternoon|good evening|buenos|buenas)/i.test(query.trim());
      const isHonorificTurn = isGreetingTurn || (totalUserQuestions % 4 === 0);

      const hasSirAlready = /\b(sir|señor)\b/i.test(cleanAnswer);

      if (isHonorificTurn) {
        // Ensure polite natural Sir/Señor on this turn if model didn't include it
        if (!hasSirAlready) {
          const isEs = /[áéíóúüñ¿¡]/i.test(cleanAnswer) || aiLanguage === 'es';
          if (isGreetingTurn) {
            const hr = new Date().getHours();
            const timeGreeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
            const spanishGreeting = hr < 12 ? 'Buenos días' : hr < 19 ? 'Buenas tardes' : 'Buenas noches';
            cleanAnswer = isEs ? `${spanishGreeting} Señor. ${cleanAnswer}` : `${timeGreeting} Sir. ${cleanAnswer}`;
          } else {
            cleanAnswer = isEs ? `Por supuesto, Señor: ${cleanAnswer}` : `Certainly, Sir: ${cleanAnswer}`;
          }
        }
      } else {
        // Strip out any repetitive Sir/Señor on intermediate questions (turns 1, 2, 3, 5, 6, 7...)
        cleanAnswer = cleanAnswer
          .replace(/,\s*(sir\b|señor\b)\.?/gi, '.')
          .replace(/\b(sir|señor)\s*[,.]?\s*/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
      }

      const aiMsg = {
        sender: 'ai',
        text: cleanAnswer,
        viewFiles: viewFiles.length > 0 ? viewFiles : undefined,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, aiMsg]);
      speakText(cleanAnswer);
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

  const handleVoiceInput = () => {
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
      const spoken = e.results[0][0].transcript;
      setIsRecording(false);
      if (spoken && spoken.trim()) {
        setInput(spoken);
        executeMessage(spoken.trim());
      }
    };
    rec.onerror = () => setIsRecording(false);
    rec.onend = () => setIsRecording(false);
    rec.start();
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
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-amber-500)', margin: 0 }}>
                    Voice & Text Co-Pilot • J.A.R.V.I.S. Audio Readout
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
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
                        {v.name} ({v.lang}) {v.name.includes('Natural') || v.name.includes('Google') || v.lang.includes('GB') ? '✨ Recommended' : ''}
                      </option>
                    ))}
                  </select>
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
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>

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
                  const next = aiLanguage === 'es' ? 'en' : 'es';
                  setAiLanguage(next);
                  localStorage.setItem('jobscan_ai_lang', next);
                }}
                style={{
                  height: '44px',
                  padding: '0 10px',
                  backgroundColor: aiLanguage === 'es' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid ' + (aiLanguage === 'es' ? '#22c55e' : '#3b82f6'),
                  color: aiLanguage === 'es' ? '#86efac' : '#93c5fd',
                  borderRadius: '8px',
                  fontSize: '0.75rem',
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
                  padding: '0 12px',
                  backgroundColor: isRecording ? 'rgba(239, 68, 68, 0.2)' : 'rgba(197, 160, 89, 0.15)',
                  border: '1px solid ' + (isRecording ? '#ef4444' : 'var(--color-amber-500)'),
                  color: isRecording ? '#ef4444' : 'var(--color-amber-500)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
                title="Voice Dictation (Mic)"
              >
                <Mic size={20} />
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

      {/* Full-Screen Mobile Interactive Document Lightbox */}
      {previewDoc.isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100000,
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            backdropFilter: 'blur(10px)'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'var(--color-zinc-950)',
              borderBottom: '1px solid var(--color-zinc-800)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: '#fff'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
              <FileText size={18} style={{ color: 'var(--color-amber-400)', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {previewDoc.fileName}
                </div>
                <div style={{ fontSize: '0.70rem', color: 'var(--color-zinc-400)' }}>
                  📁 {previewDoc.folderName}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {previewDoc.objectUrl && (
                <a
                  href={previewDoc.objectUrl}
                  download={previewDoc.fileName}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: 'var(--color-zinc-900)',
                    color: 'var(--color-zinc-200)',
                    border: '1px solid var(--color-zinc-700)',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Download size={13} /> Save
                </a>
              )}
              <a
                href={`https://drive.google.com/file/d/${previewDoc.fileId}/view`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '6px 10px',
                  backgroundColor: 'var(--color-zinc-900)',
                  color: 'var(--color-zinc-200)',
                  border: '1px solid var(--color-zinc-700)',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <ExternalLink size={13} /> Drive
              </a>
              <button
                type="button"
                onClick={() => {
                  if (previewDoc.objectUrl) URL.revokeObjectURL(previewDoc.objectUrl);
                  setPreviewDoc({ isOpen: false, fileId: '', fileName: '', folderName: '', objectUrl: '', isLoading: false, error: '' });
                }}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'var(--color-zinc-800)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <X size={16} /> Close
              </button>
            </div>
          </div>

          {/* Document Body */}
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: '8px' }}>
            {previewDoc.isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', color: 'var(--color-amber-400)' }}>
                <Loader2 size={36} className="animate-spin" />
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Fetching document from Google Drive...</span>
              </div>
            )}
            {previewDoc.error && (
              <div style={{ color: '#ef4444', textAlign: 'center', padding: '20px' }}>
                <div>{previewDoc.error}</div>
                <a
                  href={`https://drive.google.com/file/d/${previewDoc.fileId}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginTop: '12px', color: 'var(--color-amber-400)', fontWeight: 700 }}
                >
                  Open Directly in Google Drive ↗
                </a>
              </div>
            )}
            {!previewDoc.isLoading && !previewDoc.error && previewDoc.objectUrl && (
              previewDoc.fileName.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={previewDoc.objectUrl}
                  title={previewDoc.fileName}
                  style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px', backgroundColor: '#fff' }}
                />
              ) : (
                <img
                  src={previewDoc.objectUrl}
                  alt={previewDoc.fileName}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }}
                />
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}
