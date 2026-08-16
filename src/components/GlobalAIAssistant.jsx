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
  askGeminiBrain
} from '../services/builderBrainService';

export default function GlobalAIAssistant({ activeProject, selectedFolder }) {
  const projectId = activeProject?.id || selectedFolder?.name || 'default_site';
  const projectName = activeProject?.name || selectedFolder?.name || 'Active Job Site';

  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      text: `👋 Hey Boss! I'm your Adepec Field & Financial AI for "${projectName}". Ask me anything about site watch-outs, inspections, reminders, or dashboard expenses & budgets!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('jobscan_gemini_key') || '');
  const chatEndRef = useRef(null);

  // Load items when project changes
  useEffect(() => {
    const loaded = loadBrainItems(projectId);
    setItems(loaded);
  }, [projectId]);

  // Load natural voices
  useEffect(() => {
    const loadVoices = () => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
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
      if (selectedVoiceURI && availableVoices.length > 0) {
        const v = availableVoices.find((x) => x.voiceURI === selectedVoiceURI);
        if (v) utterance.voice = v;
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

      const answer = await askGeminiBrain(query, items, projectName, apiKey, null, projectId);
      const aiMsg = {
        sender: 'ai',
        text: answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, aiMsg]);
      speakText(answer);
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
    rec.lang = 'en-US';
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
                {/* Voice Selector */}
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-zinc-400)', display: 'block', marginBottom: '4px' }}>
                    🎙️ Select Natural Human Voice:
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
                placeholder='Ask Gemini: "What reminders do I have today?" or "Who do I call?"...'
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
