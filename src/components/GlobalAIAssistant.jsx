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
  MessageSquare
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
      text: `👋 Hey Boss! I'm your Adepec Field & Financial AI for "${projectName}". Ask me anything about site watch-outs, inspections, reminders, Google Drive files, or dashboard expenses & budgets!`,
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
  const [apiKey, setApiKey] = useState(localStorage.getItem('jobscan_gemini_key') || '');
  const [driveTree, setDriveTree] = useState(() => loadProjectDriveTree(projectId));
  const chatEndRef = useRef(null);

  // Sync Google Drive folders & files manifest
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

  // Load items when project changes
  useEffect(() => {
    const loaded = loadBrainItems(projectId);
    setItems(loaded);
  }, [projectId]);

  // Load natural voices (English + Spanish)
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
        utterance.lang = 'en-US';
        if (selectedVoiceURI && availableVoices.length > 0) {
          const v = availableVoices.find((x) => x.voiceURI === selectedVoiceURI);
          if (v) utterance.voice = v;
        }
      }
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const query = input.trim();
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
      if (lower.includes('mark') && (lower.includes('done') || lower.includes('complete'))) {
        const match = items.find(
          (i) => i.status === 'pending' && (lower.includes(i.title.toLowerCase()) || (i.subcontractor && lower.includes(i.subcontractor.toLowerCase())))
        );
        if (match) {
          const updated = items.map((i) => (i.id === match.id ? { ...i, status: 'completed' } : i));
          setItems(updated);
          saveBrainItems(projectId, updated);
        }
      } else if (lower.startsWith('add') || lower.startsWith('remind me at') || lower.startsWith('create watchout')) {
        const newItem = parseFieldNote(query, projectName);
        if (newItem) {
          const updated = [newItem, ...items];
          setItems(updated);
          saveBrainItems(projectId, updated);
        }
      }

      // 1. Google Drive Folder Creation Action (Flexible conversational matching)
      const isCreateFolderQuery =
        /(?:create|make|add|crea|crear|haz|hacer)\s+(?:a\s+)?(?:new\s+)?(?:subfolder|sub\s*folder|folder|carpeta|subcarpeta)\s+/i.test(query);

      if (isCreateFolderQuery && googleToken && activeProject?.folderId) {
        const folderName = query
          .replace(/^.*?(?:create|make|add|crea|crear|haz|hacer)\s+(?:a\s+)?(?:new\s+)?(?:subfolder|sub\s*folder|folder|carpeta|subcarpeta)\s+(?:for\s+this\s+project\s+)?(?:in\s+google\s+drive\s+)?(?:called|named|llamada|nombrada|para)?\s*/i, '')
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
            setMessages((prev) => [...prev, aiMsg]);
            speakText(confirmMsg);
            return;
          }
        }
      }

      // 2. Google Drive Folder Deletion Action
      const isDeleteFolderQuery =
        /(?:delete|remove|trash|borra|borrar|elimina|eliminar)\s+(?:the\s+)?(?:subfolder|sub\s*folder|folder|carpeta|subcarpeta)\s+/i.test(query);

      if (isDeleteFolderQuery && googleToken && activeProject?.folderId && driveTree?.subfolders) {
        const targetName = query
          .replace(/^.*?(?:delete|remove|trash|borra|borrar|elimina|eliminar)\s+(?:the\s+)?(?:subfolder|sub\s*folder|folder|carpeta|subcarpeta)\s+(?:called|named|llamada|nombrada)?\s*/i, '')
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
          setMessages((prev) => [...prev, aiMsg]);
          speakText(confirmMsg);
          return;
        }
      }

      const answer = await askGeminiBrain(query, items, projectName, apiKey, null, projectId, messages, driveTree);

      let cleanAnswer = answer;
      const actionCreateMatch = answer.match(/\[\[ACTION:CREATE_FOLDER:([^\]]+)\]\]/);
      if (actionCreateMatch && actionCreateMatch[1] && googleToken && activeProject?.folderId) {
        const fName = actionCreateMatch[1].trim();
        await createFolder(googleToken, fName, activeProject.folderId);
        const updatedTree = await fetchProjectDriveTree(googleToken, activeProject.folderId);
        if (updatedTree) {
          setDriveTree(updatedTree);
          saveProjectDriveTree(projectId, updatedTree);
        }
        cleanAnswer = cleanAnswer.replace(/\[\[ACTION:CREATE_FOLDER:[^\]]+\]\]/, '').trim();
      }

      const actionDeleteMatch = answer.match(/\[\[ACTION:DELETE_FOLDER:([^\]]+)\]\]/);
      if (actionDeleteMatch && actionDeleteMatch[1] && googleToken && activeProject?.folderId && driveTree?.subfolders) {
        const fName = actionDeleteMatch[1].trim().toLowerCase();
        const matchFolder = driveTree.subfolders.find(
          (f) => f.folderName.toLowerCase().includes(fName) || fName.includes(f.folderName.toLowerCase())
        );
        if (matchFolder && matchFolder.folderId) {
          await trashDriveFileOrFolder(googleToken, matchFolder.folderId);
          const updatedTree = await fetchProjectDriveTree(googleToken, activeProject.folderId);
          if (updatedTree) {
            setDriveTree(updatedTree);
            saveProjectDriveTree(projectId, updatedTree);
          }
        }
        cleanAnswer = cleanAnswer.replace(/\[\[ACTION:DELETE_FOLDER:[^\]]+\]\]/, '').trim();
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
    } finally {
      setIsLoading(false);
    }
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
      setInput(e.results[0][0].transcript);
      setIsRecording(false);
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
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            zIndex: 4000,
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
              borderRadius: '14px',
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
                    Adepec Field AI — {projectName}
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-amber-500)', margin: 0 }}>
                    Voice & Text Q&A • Natural Speech Readout
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
              {messages.map((msg, index) => (
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

              {isLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-amber-500)', fontSize: '0.82rem' }}>
                  <Sparkles size={15} className="animate-spin" /> Gemini AI is thinking...
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <form
              onSubmit={handleSendMessage}
              style={{
                padding: '12px',
                borderTop: '1px solid var(--color-zinc-800)',
                backgroundColor: 'var(--color-zinc-900)',
                display: 'flex',
                gap: '8px'
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
                onClick={handleVoiceInput}
                style={{
                  padding: '0 12px',
                  backgroundColor: isRecording ? 'rgba(239, 68, 68, 0.2)' : 'rgba(197, 160, 89, 0.15)',
                  border: '1px solid ' + (isRecording ? '#ef4444' : 'var(--color-amber-500)'),
                  color: isRecording ? '#ef4444' : 'var(--color-amber-500)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Mic size={18} />
              </button>
              <input
                type="text"
                placeholder={aiLanguage === 'es' ? 'Pregunta en Español: "¿Cuánto balance con el pintor?"...' : 'Ask Gemini in English or Spanish...'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
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
                disabled={isLoading}
                style={{
                  padding: '0 16px',
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
    </>
  );
}
