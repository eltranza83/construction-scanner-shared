import React, { useState, useEffect } from 'react';
import { Key, Save, Eye, EyeOff, UserCheck } from 'lucide-react';
import { STORAGE_KEYS, getAccountAppsScriptUrlKey, getAccountAppsScriptSecretKey } from '../config/appConfig';
import { getFirebaseAuthInstance } from '../services/firebase';

export default function SettingsApiKeysCard({ onSetSuccess, onSetError }) {
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem(STORAGE_KEYS.geminiApiKey) || '');
  const [appsScriptUrl, setAppsScriptUrl] = useState('');
  const [appsScriptSecret, setAppsScriptSecret] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuthInstance();
    const user = auth?.currentUser;
    const email = user?.email ? String(user.email).trim().toLowerCase() : '';
    setCurrentUserEmail(email);

    setGeminiApiKey(localStorage.getItem(STORAGE_KEYS.geminiApiKey) || '');
    
    const urlKey = getAccountAppsScriptUrlKey(email);
    const secretKey = getAccountAppsScriptSecretKey(email);
    setAppsScriptUrl(localStorage.getItem(urlKey) || localStorage.getItem(STORAGE_KEYS.appsScriptUrl) || '');
    setAppsScriptSecret(localStorage.getItem(secretKey) || localStorage.getItem('jobscan_apps_script_secret') || '');
  }, []);

  const handleSave = (e) => {
    e.preventDefault();
    try {
      const cleanKey = geminiApiKey.trim();
      const cleanUrl = appsScriptUrl.trim();
      const cleanSecret = appsScriptSecret.trim();

      if (cleanKey) {
        localStorage.setItem(STORAGE_KEYS.geminiApiKey, cleanKey);
      } else {
        localStorage.removeItem(STORAGE_KEYS.geminiApiKey);
      }

      const urlKey = getAccountAppsScriptUrlKey(currentUserEmail);
      const secretKey = getAccountAppsScriptSecretKey(currentUserEmail);

      if (cleanUrl) {
        localStorage.setItem(urlKey, cleanUrl);
        localStorage.setItem(STORAGE_KEYS.appsScriptUrl, cleanUrl);
      } else {
        localStorage.removeItem(urlKey);
        localStorage.removeItem(STORAGE_KEYS.appsScriptUrl);
      }

      if (cleanSecret) {
        localStorage.setItem(secretKey, cleanSecret);
        localStorage.setItem('jobscan_apps_script_secret', cleanSecret);
      } else {
        localStorage.removeItem(secretKey);
        localStorage.removeItem('jobscan_apps_script_secret');
      }

      setIsSaved(true);
      if (onSetSuccess) onSetSuccess('Account API settings saved!');
      setTimeout(() => {
        setIsSaved(false);
        if (onSetSuccess) onSetSuccess(null);
      }, 3000);
    } catch (err) {
      console.error('Failed to save API settings:', err);
      if (onSetError) onSetError('Failed to save API settings.');
    }
  };

  return (
    <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', marginTop: '12px', padding: '16px', borderRadius: '10px', backgroundColor: 'var(--color-zinc-900)' }}>
      <h3 style={{ color: 'var(--color-zinc-200)', fontSize: '0.95rem', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Key size={18} style={{ color: 'var(--color-amber-500)' }} />
        Per-Account Apps Script & API Keys
      </h3>

      {currentUserEmail && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: 'var(--color-emerald-400)', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '6px 10px', borderRadius: '6px', marginBottom: '12px' }}>
          <UserCheck size={14} />
          <span>Configuring settings for: <strong>{currentUserEmail}</strong></span>
        </div>
      )}

      <p style={{ fontSize: '0.78rem', color: 'var(--color-zinc-400)', marginBottom: '14px', lineHeight: 1.4 }}>
        Configure your Gemini API Key and Apps Script Web App URL specifically for this signed-in Google account.
      </p>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-zinc-300)', marginBottom: '6px' }}>
            Gemini API Key
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder="AIzaSy..."
              style={{
                width: '100%',
                padding: '8px 36px 8px 10px',
                borderRadius: '6px',
                border: '1px solid var(--color-zinc-700)',
                backgroundColor: 'var(--color-zinc-950)',
                color: 'var(--color-zinc-100)',
                fontSize: '0.82rem'
              }}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              style={{
                position: 'absolute',
                right: '8px',
                background: 'none',
                border: 'none',
                color: 'var(--color-zinc-400)',
                cursor: 'pointer'
              }}
              title={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-zinc-300)', marginBottom: '6px' }}>
            Apps Script Web App URL ({currentUserEmail || 'Default Account'})
          </label>
          <input
            type="url"
            value={appsScriptUrl}
            onChange={(e) => setAppsScriptUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '6px',
              border: '1px solid var(--color-zinc-700)',
              backgroundColor: 'var(--color-zinc-950)',
              color: 'var(--color-zinc-100)',
              fontSize: '0.82rem'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-zinc-300)', marginBottom: '6px' }}>
            Apps Script Webhook Secret (Optional)
          </label>
          <input
            type="text"
            value={appsScriptSecret}
            onChange={(e) => setAppsScriptSecret(e.target.value)}
            placeholder="e.g. adepec_scanner_secret_2026"
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '6px',
              border: '1px solid var(--color-zinc-700)',
              backgroundColor: 'var(--color-zinc-950)',
              color: 'var(--color-zinc-100)',
              fontSize: '0.82rem'
            }}
          />
        </div>

        <button
          type="submit"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            backgroundColor: isSaved ? 'var(--color-emerald-600)' : 'var(--color-amber-500)',
            color: '#000',
            fontWeight: 700,
            border: 'none',
            borderRadius: '6px',
            padding: '8px 14px',
            fontSize: '0.82rem',
            cursor: 'pointer',
            marginTop: '4px',
            transition: 'background-color 0.2s'
          }}
        >
          <Save size={16} />
          {isSaved ? 'Saved Settings!' : 'Save Account Settings'}
        </button>
      </form>
    </div>
  );
}
