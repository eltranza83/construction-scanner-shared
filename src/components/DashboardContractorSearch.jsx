import React, { useState } from 'react';
import { Search, Mic, MicOff, Sparkles, FileText, Download } from 'lucide-react';
import DashboardContractorDetail from './DashboardContractorDetail';
import { queryGeminiProjectAssistant } from '../services/geminiAiAssistant';
import { generateVoiceExpenseVoucherPdf } from '../services/voicePdfGenerator';
import { getClientGeminiApiKey } from '../services/gemini';

export default function DashboardContractorSearch({
  searchTerm,
  suggestions,
  selectedSub,
  subcontractors,
  dashboardData,
  activeProjectName,
  activeFolderId,
  googleToken,
  formatCurrency,
  getStatusStyle,
  onSearchTermChange,
  onSelectSubcontractor,
  onClearSelection,
  onViewPhasePhotos,
  onShowToast
}) {
  const [listening, setListening] = useState(false);
  const [aiResponseCard, setAiResponseCard] = useState(null);
  const [isProcessingAi, setIsProcessingAi] = useState(false);

  const safeFormatCurrency = (val) => {
    if (typeof formatCurrency === 'function') {
      return formatCurrency(val);
    }
    const num = parseFloat(String(val || 0).replace(/[^0-9.-]/g, '')) || 0;
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const speakResponse = (textToSpeak) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const processVoiceQuery = async (rawQuery) => {
    const text = rawQuery.toLowerCase().trim();
    onSearchTermChange(rawQuery);

    const clientApiKey = getClientGeminiApiKey();
    const allSubs = subcontractors || suggestions || [];

    // 1. Always use Gemini AI if API key is available
    if (clientApiKey) {
      setIsProcessingAi(true);
      try {
        if (onShowToast) {
          onShowToast('🤖 Gemini 3.1 Flash-Lite analyzing project...', 'info');
        }

        const aiResult = await queryGeminiProjectAssistant({
          query: rawQuery,
          dashboardData,
          activeProjectName,
          apiKey: clientApiKey
        });

        setIsProcessingAi(false);

        if (aiResult?.answerText) {
          speakResponse(aiResult.answerText);
          setAiResponseCard(aiResult);

          // If Gemini identified a specific trade phase, select it automatically on screen
          if (aiResult.matchedPhase && allSubs.length > 0) {
            const phaseLower = aiResult.matchedPhase.toLowerCase();
            const matchedSub = allSubs.find(s =>
              (s.phase || '').toLowerCase().includes(phaseLower) ||
              phaseLower.includes((s.phase || '').toLowerCase()) ||
              (s.payee || '').toLowerCase().includes(phaseLower)
            );
            if (matchedSub) {
              onSelectSubcontractor(matchedSub);
            }
          }

          if (aiResult.action === 'CREATE_PDF_RECEIPT' && aiResult.pdfDetails) {
            const pdfRes = await generateVoiceExpenseVoucherPdf({
              ...aiResult.pdfDetails,
              project: activeProjectName || aiResult.pdfDetails.project || 'Active Lot'
            });

            // Trigger instant browser download
            const url = URL.createObjectURL(pdfRes.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = pdfRes.filename;
            a.click();
            URL.revokeObjectURL(url);

            const pdfSuccessMsg = `Created $${aiResult.pdfDetails.amount} PDF Voucher under Extra Costs & Misc!`;
            if (onShowToast) {
              onShowToast(`📄 ${pdfSuccessMsg}`, 'success');
            }
          } else {
            if (onShowToast) {
              onShowToast(`🤖 Gemini AI: ${aiResult.answerText}`, 'success');
            }
          }
          return;
        }
      } catch (err) {
        setIsProcessingAi(false);
        console.warn('Gemini AI Assistant failed, using local matcher fallback:', err);
      }
    }

    if (allSubs.length === 0) {
      speakResponse("No contractor data is available yet.");
      return;
    }

    // 2. Handle "biggest / largest / most expensive" query locally if offline
    if (text.includes('biggest') || text.includes('largest') || text.includes('highest') || text.includes('most expensive')) {
      let maxSub = null;
      let maxAmount = 0;

      allSubs.forEach(sub => {
        const amt = parseFloat(sub.originalQuote || sub.totalLabor || sub.totalPaid || 0) || 0;
        if (amt > maxAmount) {
          maxAmount = amt;
          maxSub = sub;
        }
      });

      if (maxSub) {
        onSelectSubcontractor(maxSub);
        const displayPayee = (!maxSub.payee || maxSub.payee.toLowerCase() === 'unassigned')
          ? maxSub.phase
          : `${maxSub.payee} (${maxSub.phase})`;
        const biggestMsg = `Your biggest expense so far is ${displayPayee} with a total quote of ${safeFormatCurrency(maxAmount)}.`;
        speakResponse(biggestMsg);
        if (onShowToast) {
          onShowToast(`📊 ${biggestMsg}`, 'success');
        }
        return;
      }
    }

    // 3. Local Search Matcher Fallback for specific contractor lookups
    const cleanSearch = text
      .replace(/\b(how much|do we owe|have we paid|what is the|give me the|can you give me|balance|on|the|a|an|quote|for|guy|man|person|installer|contractor|sub|company|services|owe|paid|amount|cost|check|total|we|do|how|much|what|give|me|can|you|so|far|project|in)\b/gi, ' ')
      .replace(/[^a-z0-9\s]/gi, '')
      .trim();

    const searchTokens = (cleanSearch || text)
      .split(/\s+/)
      .filter(t => t.length > 2 && !['and', 'the', 'for', 'was', 'with', 'out', 'off'].includes(t));

    const tradeAliases = {
      plumber: ['plumb', 'pipe', 'drain', 'water', 'sewer', 'rough-in', 'faucet'],
      framing: ['frame', 'framing', 'framer', 'lumber', 'wood', 'stud', 'truss', 'carpenter', 'carpentry'],
      porch: ['porch', 'patio', 'deck', 'trim', 'carpentry', 'woodwork'],
      towel: ['towel', 'hardware', 'fixture', 'faucet', 'bath', 'bathroom', 'knob', 'handle'],
      electrician: ['electric', 'electrical', 'electrician', 'wiring', 'wire', 'panel', 'light', 'lighting', 'outlet', 'fixture'],
      hvac: ['hvac', 'ac', 'air', 'heat', 'heating', 'cooling', 'duct'],
      roofing: ['roof', 'roofing', 'roofer', 'shingle'],
      paint: ['paint', 'painting', 'painter', 'wall', 'primer', 'finish'],
      drywall: ['drywall', 'sheetrock', 'tape', 'float', 'wallboard'],
      foundation: ['concrete', 'slab', 'flatwork', 'rebar', 'foundation'],
      tile: ['tile', 'tiling', 'tiler', 'tileman', 'flooring', 'floor', 'grout', 'marble', 'slab'],
      stucco: ['stucco', 'masonry', 'stone', 'cantera', 'brick', 'block'],
      landscaping: ['landscaping', 'landscape', 'yard', 'lawn', 'irrigation', 'fence', 'fencing', 'gate'],
      dumpster: ['dumpster', 'dumpsters', 'trash', 'dump', 'cleaning', 'clean', 'debris', 'trash haul'],
      utilities: ['utility', 'electric bill', 'water bill', 'power', 'bills', 'overhead', 'monthly bills'],
      permits: ['permit', 'permits', 'engineering', 'architect', 'city', 'plan'],
      doors: ['garage door', 'window', 'windows', 'exterior door', 'door'],
      countertops: ['counter', 'countertop', 'quartz', 'granite', 'island'],
      glass: ['glass', 'mirror', 'shower door', 'enclosure']
    };

    let bestSub = null;
    let highestScore = 0;

    allSubs.forEach(sub => {
      let score = 0;
      const payee = (sub.payee || '').toLowerCase().trim();
      const phase = (sub.phase || '').toLowerCase().trim();
      const cat = (sub.category || '').toLowerCase().trim();
      const combined = `${payee} ${phase} ${cat}`;

      const isUnassigned = !payee || payee === 'unassigned' || payee === 'n/a';

      // 1. Direct Payee Match (ignoring unassigned/empty)
      if (!isUnassigned) {
        if (payee === cleanSearch || payee === text) score += 100;
        else if (cleanSearch.length > 2 && (cleanSearch.includes(payee) || text.includes(payee))) score += 80;
        else if (payee.includes(cleanSearch)) score += 60;
      }

      // 2. Direct Phase or Category Match
      if (phase && cleanSearch.length > 2 && (phase.includes(cleanSearch) || cleanSearch.includes(phase))) score += 70;
      if (cat && cleanSearch.length > 2 && (cat.includes(cleanSearch) || cleanSearch.includes(cat))) score += 50;

      // 3. Search Token Matching against Phase/Category/Payee
      searchTokens.forEach(token => {
        if (token.length <= 2) return;
        if (phase.includes(token)) score += 35;
        if (cat.includes(token)) score += 20;
        if (!isUnassigned && payee.includes(token)) score += 45;
      });

      // 4. Trade Alias Matching
      for (const [key, aliases] of Object.entries(tradeAliases)) {
        const queryHasAlias = text.includes(key) || searchTokens.some(t => key.includes(t) || t.includes(key) || aliases.some(a => a.includes(t) || t.includes(a)));
        if (queryHasAlias) {
          const subHasAlias = combined.includes(key) || aliases.some(a => combined.includes(a));
          if (subHasAlias) {
            score += 65;
          }
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestSub = sub;
      }
    });

    if (bestSub && highestScore >= 35) {
      onSelectSubcontractor(bestSub);
      const quoteVal = safeFormatCurrency(bestSub.originalQuote);
      const paidVal = safeFormatCurrency(bestSub.totalLabor || bestSub.totalPaid || 0);
      const balanceVal = safeFormatCurrency(bestSub.remainingBalance);

      const displayPayee = (!bestSub.payee || bestSub.payee.toLowerCase() === 'unassigned')
        ? bestSub.phase
        : `${bestSub.payee} (${bestSub.phase})`;

      const voiceMsg = `${displayPayee}. Quote: ${quoteVal}, Paid: ${paidVal}, Remaining balance: ${balanceVal}.`;
      speakResponse(voiceMsg);
      if (onShowToast) {
        onShowToast(`🎙️ "${rawQuery}": ${voiceMsg}`, 'success');
      }
    } else {
      const notFoundMsg = `I heard "${rawQuery}", but couldn't find a matching contractor or phase.`;
      speakResponse(notFoundMsg);
      if (onShowToast) {
        onShowToast(notFoundMsg, 'info');
      }
    }
  };

  const handleVoiceButtonClick = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (onShowToast) {
        onShowToast('Voice search is not supported by your current browser.', 'error');
      }
      return;
    }

    if (listening) {
      setListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setListening(true);
        if (onShowToast) {
          onShowToast('🎙️ Listening... Ask e.g. "How much do I owe the plumber?"', 'info');
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setListening(false);
        if (onShowToast) {
          onShowToast(`Voice recognition notice: ${event.error}`, 'info');
        }
      };

      recognition.onend = () => {
        setListening(false);
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          processVoiceQuery(transcript);
        }
      };

      recognition.start();
    } catch (err) {
      console.error(err);
      setListening(false);
    }
  };

  return (
    <div id="contractor-lookup-container" className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-zinc-200)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Search size={16} style={{ color: 'var(--color-amber-500)' }} />
          Contractor Balance Lookup
        </span>
        <button
          type="button"
          onClick={handleVoiceButtonClick}
          style={{
            background: listening ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.06)',
            border: listening ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.12)',
            color: listening ? '#f59e0b' : 'var(--color-zinc-300)',
            fontSize: '0.72rem',
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: '20px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: listening ? '0 0 12px rgba(245, 158, 11, 0.4)' : 'none'
          }}
          title="Click to speak (e.g. How much do I owe the plumber?)"
        >
          {listening ? <MicOff size={13} style={{ color: '#f59e0b' }} /> : <Mic size={13} style={{ color: 'var(--color-amber-400)' }} />}
          {listening ? 'Listening...' : 'Ask Voice Assistant 🎙️'}
        </button>
      </h3>

      <div style={{ position: 'relative' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Search payee or ask out loud (e.g. Plumber)..."
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          style={{ width: '100%', paddingLeft: '36px', paddingRight: '36px' }}
        />
        <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-zinc-600)' }} />
        <button
          type="button"
          onClick={handleVoiceButtonClick}
          style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            color: listening ? '#f59e0b' : 'var(--color-zinc-400)',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center'
          }}
          title="Speak query"
        >
          {listening ? <MicOff size={15} style={{ color: '#f59e0b' }} /> : <Mic size={15} />}
        </button>

        {searchTerm && suggestions.length > 0 && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            width: '100%',
            backgroundColor: 'var(--color-zinc-950)',
            border: '1px solid var(--color-zinc-800)',
            borderRadius: '8px',
            zIndex: 900,
            maxHeight: '180px',
            overflowY: 'auto',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.8)'
          }}>
            {suggestions.map(sub => (
              <div
                key={sub.id}
                onClick={() => onSelectSubcontractor(sub)}
                style={{
                  padding: '10px 12px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--color-zinc-900)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                className="project-profile-row"
              >
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--color-zinc-200)' }}>{sub.payee}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-zinc-500)', marginLeft: '6px' }}>({sub.phase})</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-zinc-400)', fontWeight: 600 }}>{formatCurrency(sub.remainingBalance)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {isProcessingAi && (
        <div style={{
          padding: '12px 14px',
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.8rem',
          color: '#f59e0b'
        }}>
          <Sparkles size={16} className="animate-spin" />
          <span>Gemini 3.1 Flash-Lite analyzing project & financial data...</span>
        </div>
      )}

      {aiResponseCard && !isProcessingAi && (
        <div className="card-glass-gold" style={{ padding: '14px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-amber-400)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} />
              Gemini 3.1 Flash-Lite AI Answer
            </span>
            <button
              type="button"
              onClick={() => setAiResponseCard(null)}
              style={{ background: 'none', border: 'none', color: 'var(--color-zinc-500)', fontSize: '0.72rem', cursor: 'pointer' }}
            >
              Dismiss
            </button>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--color-zinc-200)', lineHeight: 1.4, margin: 0 }}>
            {aiResponseCard.answerText}
          </p>

          {aiResponseCard.action === 'CREATE_PDF_RECEIPT' && aiResponseCard.pdfDetails && (
            <div style={{
              marginTop: '4px',
              padding: '10px 12px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justify: 'space-between',
              fontSize: '0.78rem'
            }}>
              <span style={{ color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={14} />
                PDF Voucher Generated: ${aiResponseCard.pdfDetails.amount.toFixed(2)} (Extra Costs & Misc)
              </span>
              <button
                type="button"
                onClick={async () => {
                  const pdfRes = await generateVoiceExpenseVoucherPdf({
                    ...aiResponseCard.pdfDetails,
                    project: activeProjectName || aiResponseCard.pdfDetails.project || 'Active Lot'
                  });
                  const url = URL.createObjectURL(pdfRes.blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = pdfRes.filename;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="btn-gold-action"
                style={{ padding: '3px 8px', fontSize: '0.7rem' }}
              >
                <Download size={11} /> Download PDF
              </button>
            </div>
          )}
        </div>
      )}

      <DashboardContractorDetail
        selectedSub={selectedSub}
        formatCurrency={formatCurrency}
        getStatusStyle={getStatusStyle}
        onViewPhasePhotos={onViewPhasePhotos}
        onClearSelection={onClearSelection}
        onShowToast={onShowToast}
      />
    </div>
  );
}
