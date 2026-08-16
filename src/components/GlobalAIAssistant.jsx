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
  Loader2
} from 'lucide-react';
import {
  loadBrainItems,
  saveBrainItems,
  parseFieldNote,
  askGeminiBrain,
  loadProjectDriveTree,
  saveProjectDriveTree
} from '../services/builderBrainService';
import { fetchProjectDriveTree, createFolder, trashDriveFileOrFolder } from '../services/googleDrive';

export default function GlobalAIAssistant({ activeProject, selectedFolder, googleToken }) {
  const projectId = activeProject?.id || selectedFolder?.name || 'default_site';
  const projectName = activeProject?.name || selectedFolder?.name || 'Active Job Site';

  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      text: `Online and at your service, sir. I have indexed all project financials, Google Drive files, and field watch-outs for "${projectName}". How may I assist you today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
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
  const chatEndRef = useRef(null);

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

  // Load items when project changes
  useEffect(() => {
    const loaded = loadBrainItems(projectId);
    setItems(loaded);
  }, [projectId]);

  // Load natural voices (English + Spanish) with J.A.R.V.I.S. British English priority
  useEffect(() => {
    const loadVoices = () => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en') || v.lang.startsWith('es'));
        voices.sort((a, b) => {
          const aGB = a.lang === 'en-GB' || a.lang.startsWith('en-GB') || a.name.includes('George') || a.name.includes('Daniel') || a.name.includes('Arthur');
          const bGB = b.lang === 'en-GB' || b.lang.startsWith('en-GB') || b.name.includes('George') || b.name.includes('Daniel') || b.name.includes('Arthur');
          if (aGB && !bGB) return -1;
          if (!aGB && bGB) return 1;
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
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

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
        const spanishVoice =
          availableVoices.find((v) => v.lang === 'es-MX' || v.lang === 'es-US' || v.lang === 'es-419') ||
          availableVoices.find((v) => (v.name.includes('Mexico') || v.name.includes('Mexican') || v.name.includes('United States') || v.name.includes('Sabina') || v.name.includes('Raul') || v.name.includes('Jorge') || v.name.includes('Dalia') || v.name.includes('Paulina')) && v.lang.startsWith('es')) ||
          availableVoices.find((v) => v.lang.startsWith('es') && !v.lang.includes('ES')) ||
          availableVoices.find((v) => v.lang.startsWith('es'));
        if (spanishVoice) utterance.voice = spanishVoice;
      } else {
        utterance.lang = 'en-GB';
        const jarvisVoice =
          availableVoices.find((v) => (v.lang === 'en-GB' || v.lang.startsWith('en-GB')) && (v.name.includes('George') || v.name.includes('Daniel') || v.name.includes('Arthur') || v.name.includes('Oliver') || v.name.includes('UK') || v.name.includes('British') || v.name.includes('Male'))) ||
          availableVoices.find((v) => v.lang === 'en-GB' || v.lang.startsWith('en-GB')) ||
          (selectedVoiceURI ? availableVoices.find((x) => x.voiceURI === selectedVoiceURI) : null) ||
          availableVoices.find((v) => v.lang.startsWith('en'));
        if (jarvisVoice) utterance.voice = jarvisVoice;
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
      const lower = query.toLowerCase();
      // Client-side quick field item toggle if explicitly requested
      if (lower.includes('mark') && (lower.includes('done') || lower.includes('complete'))) {
        const match = items.find(
          (i) => i.status === 'pending' && (lower.includes(i.title.toLowerCase()) || (i.subcontractor && lower.includes(i.subcontractor.toLowerCase())))
        );
        if (match) {
          const updated = items.map((i) => (i.id === match.id ? { ...i, status: 'completed' } : i));
          setItems(updated);
          saveBrainItems(projectId, updated);
        }
      }

      const answer = await askGeminiBrain(query, items, projectName, apiKey, null, projectId, messages, driveTree);

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

      // 3. Add Item / Reminder / Watch-Out Action
      const actionAddItemMatch = answer.match(/\[\[ACTION:ADD_ITEM:([^\]]+)\]\]/);
      if (actionAddItemMatch && actionAddItemMatch[1]) {
        try {
          const itemData = JSON.parse(actionAddItemMatch[1]);
          const newItem = {
            id: 'brain_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            rawInput: query,
            title: itemData.title || query,
            category: itemData.category || 'reminder',
            subcontractor: itemData.subcontractor || null,
            targetDate: itemData.targetDate || null,
            notes: itemData.notes || '',
            lot: activeProject?.name || projectName || 'General Site',
            status: 'pending',
            createdAt: new Date().toISOString()
          };
          setItems((prev) => {
            const updated = [newItem, ...prev];
            saveBrainItems(projectId, updated);
            return updated;
          });
        } catch {
          const parsed = parseFieldNote(query, projectName);
          if (parsed) {
            setItems((prev) => {
              const updated = [parsed, ...prev];
              saveBrainItems(projectId, updated);
              return updated;
            });
          }
        }
        cleanAnswer = cleanAnswer.replace(/\[\[ACTION:ADD_ITEM:[^\]]+\]\]/, '').trim();
      } else {
        const isCreateNoteQuery = /(?:remind\s+me|schedule\s+(?:a\s+)?reminder|add\s+(?:a\s+)?reminder|create\s+(?:a\s+)?reminder|recu[eé]rdame|haz\s+(?:un\s+)?recordatorio|crea\s+(?:un\s+)?recordatorio|watch\s*out|watchout)/i.test(query);
        if (isCreateNoteQuery) {
          const parsed = parseFieldNote(query, projectName);
          if (parsed) {
            setItems((prev) => {
              const updated = [parsed, ...prev];
              saveBrainItems(projectId, updated);
              return updated;
            });
          }
        }
      }

      const aiMsg = {
        sender: 'ai',
        text: cleanAnswer,
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
    </>
  );
}
