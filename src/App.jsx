import React, { useState, useEffect } from 'react';
import { Camera, History, Settings as SettingsIcon, Sparkles, Folder, LogIn, LogOut, CheckCircle, FileText, Download, Check, Database } from 'lucide-react';
import Scanner from './components/Scanner';
import StagingCard from './components/StagingCard';
import EditForm from './components/EditForm';
import Settings from './components/Settings';
import InviteScreen from './components/InviteScreen';
import { generateDocumentPDF } from './services/pdfGenerator';
import { uploadFileToDrive, findOrCreateTrackingSheet, appendRowToSheet } from './services/googleDrive';
import { getFirebaseDb } from './services/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function App() {
  // Config & Auth State
  const [geminiKey, setGeminiKey] = useState('');
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleToken, setGoogleToken] = useState(null);
  const [googleUser, setGoogleUser] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);

  // App Navigation & UI State
  const [activeTab, setActiveTab] = useState('scanner');
  const [stagedItems, setStagedItems] = useState([]);
  const [editingItemId, setEditingItemId] = useState(null);
  const [draftToDelete, setDraftToDelete] = useState(null);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [uploading, setUploading] = useState(null); // stores the draft ID being uploaded
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [hasUnprocessedUploads, setHasUnprocessedUploads] = useState(
    localStorage.getItem('jobscan_has_unprocessed_uploads') === 'true'
  );
  const [triggeringSync, setTriggeringSync] = useState(false);
  const checkInitialInviteState = () => {
    const userStr = localStorage.getItem('jobscan_google_user');
    if (!userStr) return false;
    try {
      const user = JSON.parse(userStr);
      return localStorage.getItem('jobscan_authorized_email') === user.email;
    } catch (e) {
      return false;
    }
  };

  const [isInvited, setIsInvited] = useState(checkInitialInviteState());

  // Load configuration and history on mount
  useEffect(() => {
    const key = localStorage.getItem('jobscan_gemini_key') || '';
    if (!localStorage.getItem('jobscan_gemini_key')) {
      localStorage.setItem('jobscan_gemini_key', '');
    }
    const cid = localStorage.getItem('jobscan_google_client_id') || '523814311929-lku3c1m2rq4qpmbf1earpgnm1beuvq8m.apps.googleusercontent.com';
    if (!localStorage.getItem('jobscan_google_client_id')) {
      localStorage.setItem('jobscan_google_client_id', '523814311929-lku3c1m2rq4qpmbf1earpgnm1beuvq8m.apps.googleusercontent.com');
    }
    const token = localStorage.getItem('jobscan_google_token') || null;
    const userStr = localStorage.getItem('jobscan_google_user');
    const folderId = localStorage.getItem('jobscan_folder_id');
    const folderName = localStorage.getItem('jobscan_folder_name');
    const projectsStr = localStorage.getItem('jobscan_projects') || '[]';
    const activeProjectStr = localStorage.getItem('jobscan_active_project') || 'null';
    const historyStr = localStorage.getItem('jobscan_history') || '[]';
    const stagedStr = localStorage.getItem('jobscan_staged_items') || '[]';

    setGeminiKey(key);
    setGoogleClientId(cid);
    setGoogleToken(token);
    if (userStr) setGoogleUser(JSON.parse(userStr));
    if (folderId && folderName) setSelectedFolder({ id: folderId, name: folderName });
    setHistory(JSON.parse(historyStr));

    try {
      setProjects(JSON.parse(projectsStr));
      setActiveProject(JSON.parse(activeProjectStr));
    } catch (e) {
      console.error('Failed to parse projects or active project:', e);
    }

    // Restore staged scan list (now preserves base64 images!)
    if (stagedStr) {
      try {
        setStagedItems(JSON.parse(stagedStr));
      } catch (e) {
        console.error('Failed to restore staged items:', e);
      }
    }

    // Load Google Identity Services Script dynamically
    if (!document.getElementById('google-gis-script')) {
      const script = document.createElement('script');
      script.id = 'google-gis-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
  }, []);

  // Fetch shared Gemini key from Firestore if unlocked
  useEffect(() => {
    const fetchSharedGeminiKey = async () => {
      const db = getFirebaseDb();
      if (!db) return;
      try {
        const docRef = doc(db, 'invites', 'CONFIG-GEMINI');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data && data.apiKey) {
            setGeminiKey(data.apiKey);
            localStorage.setItem('jobscan_gemini_key', data.apiKey);
          }
        }
      } catch (err) {
        console.error('Failed to fetch shared Gemini key from Firestore:', err);
      }
    };

    if (isInvited) {
      fetchSharedGeminiKey();
    }
  }, [isInvited]);

  // Close project dropdown when clicking outside
  useEffect(() => {
    if (!showProjectDropdown) return;

    const handleOutsideClick = (e) => {
      const headerSection = document.querySelector('.header-project-section');
      if (headerSection && !headerSection.contains(e.target)) {
        setShowProjectDropdown(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('click', handleOutsideClick);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleOutsideClick);
    };
  }, [showProjectDropdown]);

  // Save history to LocalStorage
  const saveHistory = (newHistory) => {
    setHistory(newHistory);
    localStorage.setItem('jobscan_history', JSON.stringify(newHistory));
  };

  // Google OAuth Login
  const handleGoogleSignIn = () => {
    if (!googleClientId) {
      setError('Please set your Google Web Client ID in the Settings tab first.');
      setActiveTab('settings');
      return;
    }

    setError(null);
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets email profile',
        callback: async (tokenResponse) => {
          if (tokenResponse.access_token) {
            setGoogleToken(tokenResponse.access_token);
            localStorage.setItem('jobscan_google_token', tokenResponse.access_token);
            
            // Fetch User Details
            try {
              const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
              });
              if (res.ok) {
                const info = await res.json();
                setGoogleUser(info);
                localStorage.setItem('jobscan_google_user', JSON.stringify(info));
                setSuccess('Successfully signed in with Google!');
                setTimeout(() => setSuccess(null), 3000);
              } else {
                const errText = await res.text();
                setError(`Failed to retrieve Google profile: ${res.status} ${errText}`);
              }
            } catch (err) {
              console.error('Failed to get Google User details:', err);
              setError(`Failed to retrieve Google profile: ${err.message}`);
            }
          }
        },
        error_callback: (err) => {
          setError(`Google Sign In failed: ${err.message}`);
        }
      });
      client.requestAccessToken();
    } catch (err) {
      console.error(err);
      setError('Failed to initialize Google login client. Make sure client ID is valid.');
    }
  };

  const handleSignOut = () => {
    setGoogleToken(null);
    setGoogleUser(null);
    setSelectedFolder(null);
    setActiveProject(null);
    setIsInvited(false);
    localStorage.removeItem('jobscan_google_token');
    localStorage.removeItem('jobscan_google_user');
    localStorage.removeItem('jobscan_folder_id');
    localStorage.removeItem('jobscan_folder_name');
    localStorage.removeItem('jobscan_active_project');
    localStorage.removeItem('jobscan_authorized_email');
    localStorage.removeItem('jobscan_invited');
    setSuccess('Signed out of Google account.');
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleSelectActiveProject = (projectId) => {
    if (!projectId) {
      setActiveProject(null);
      localStorage.setItem('jobscan_active_project', 'null');
      return;
    }

    const proj = projects.find(p => p.id === projectId);
    if (proj) {
      setActiveProject(proj);
      localStorage.setItem('jobscan_active_project', JSON.stringify(proj));

      setSelectedFolder({ id: proj.folderId, name: proj.folderName });
      localStorage.setItem('jobscan_folder_id', proj.folderId);
      localStorage.setItem('jobscan_folder_name', proj.folderName);

      setSuccess(`Switched active project to: "${proj.name}"`);
      setTimeout(() => setSuccess(null), 2500);
    }
  };

  const handleTriggerAppsScriptSync = async () => {
    if (!activeProject?.appsScriptUrl) return;
    setTriggeringSync(true);
    setError(null);
    try {
      // Trigger Apps Script webhook POST sync action
      await fetch(`${activeProject.appsScriptUrl}?action=sync`, {
        method: 'POST',
        mode: 'no-cors'
      });
      
      // Wait a moment to show completion
      setTimeout(() => {
        setHasUnprocessedUploads(false);
        localStorage.setItem('jobscan_has_unprocessed_uploads', 'false');
        setTriggeringSync(false);
        setSuccess('Spreadsheet sync triggered successfully! Check your spreadsheet in a few seconds.');
        setTimeout(() => setSuccess(null), 4000);
      }, 2000);
      
    } catch (err) {
      console.error(err);
      setError(`Failed to trigger spreadsheet sync: ${err.message}`);
      setTriggeringSync(false);
    }
  };

  // Helper to convert File to base64 Data URL
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // Staging scan callback
  const handleDataExtracted = async (scanItem) => {
    setError(null);
    try {
      let mainImageBase64 = null;
      if (scanItem.mainImage) {
        mainImageBase64 = await fileToBase64(scanItem.mainImage);
      }
      
      const newDraft = {
        id: `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        metadata: {
          ...scanItem.metadata,
          lotNumber: activeProject ? activeProject.name : ''
        },
        mainImageBase64,
        secondaryImageBase64: null,
        createdAt: Date.now(),
        timerDuration: 60 * 60 * 1000 // 60 minutes default
      };

      const updatedDrafts = [newDraft, ...stagedItems];
      setStagedItems(updatedDrafts);
      
      try {
        localStorage.setItem('jobscan_staged_items', JSON.stringify(updatedDrafts));
      } catch (e) {
        console.error('LocalStorage quota error:', e);
        setError('Storage full! Draft saved in memory, but please sync items to free up browser space.');
      }

      setSuccess('Check/Invoice scanned and saved to Drafts!');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      console.error(err);
      setError(`Failed to save scanned item to drafts: ${err.message}`);
    }
  };

  const handleSaveStagedEdits = (updatedItem) => {
    const updatedDrafts = stagedItems.map(item => {
      if (item.id === editingItemId) {
        return {
          ...item,
          metadata: updatedItem.metadata,
          mainImageBase64: updatedItem.mainImageBase64,
          secondaryImageBase64: updatedItem.secondaryImageBase64
        };
      }
      return item;
    });
    setStagedItems(updatedDrafts);
    localStorage.setItem('jobscan_staged_items', JSON.stringify(updatedDrafts));
    setEditingItemId(null);
    setSuccess('Draft updated successfully!');
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleDeleteStaged = (id) => {
    const item = stagedItems.find(i => i.id === id);
    if (item) {
      setDraftToDelete(item);
    }
  };

  const confirmDeleteDraft = () => {
    if (!draftToDelete) return;
    const updatedDrafts = stagedItems.filter(item => item.id !== draftToDelete.id);
    setStagedItems(updatedDrafts);
    localStorage.setItem('jobscan_staged_items', JSON.stringify(updatedDrafts));
    setDraftToDelete(null);
    setSuccess('Draft discarded successfully!');
    setTimeout(() => setSuccess(null), 2500);
  };

  const handleAdjustTimer = (id, additionalMinutes) => {
    const updatedDrafts = stagedItems.map(item => {
      if (item.id === id) {
        return {
          ...item,
          timerDuration: item.timerDuration + (additionalMinutes * 60 * 1000)
        };
      }
      return item;
    });
    setStagedItems(updatedDrafts);
    localStorage.setItem('jobscan_staged_items', JSON.stringify(updatedDrafts));
  };

  const handleResetTimer = (id) => {
    const updatedDrafts = stagedItems.map(item => {
      if (item.id === id) {
        return {
          ...item,
          createdAt: Date.now(),
          timerDuration: 60 * 60 * 1000
        };
      }
      return item;
    });
    setStagedItems(updatedDrafts);
    localStorage.setItem('jobscan_staged_items', JSON.stringify(updatedDrafts));
  };

  const handleUpdateDraftField = (id, field, value) => {
    const updatedDrafts = stagedItems.map(item => {
      if (item.id === id) {
        return {
          ...item,
          metadata: {
            ...item.metadata,
            [field]: value
          }
        };
      }
      return item;
    });
    setStagedItems(updatedDrafts);
    localStorage.setItem('jobscan_staged_items', JSON.stringify(updatedDrafts));
  };

  // Upload/Sync Action
  const handleSyncToDrive = async (id) => {
    const itemToSync = stagedItems.find(item => item.id === id);
    if (!itemToSync) return;
    
    setError(null);
    setUploading(id);

    try {
      const { metadata, mainImageBase64, secondaryImageBase64 } = itemToSync;
      const images = [];
      if (mainImageBase64) images.push(mainImageBase64);
      if (secondaryImageBase64) images.push(secondaryImageBase64);

      // 1. Generate PDF
      const pdfBlob = await generateDocumentPDF(metadata, images);

      // Check if running in Offline / Download fallback
      const isOfflineMode = !googleToken || !selectedFolder;

      if (isOfflineMode) {
        // Generate clean and safe file name based on: LotNumber - Description - CostCategory.pdf
        const lot = (metadata.lotNumber || 'No_Lot').trim();
        const desc = (metadata.description || 'Expense').trim().substring(0, 30).trim();
        const category = (metadata.costCategory || 'material').trim().toLowerCase();
        const rawName = `${lot} - ${desc} - ${category}.pdf`;
        const safeFileName = rawName.replace(/[\/\\:*?"<>|]/g, '_');

        // Trigger browser download
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = safeFileName;
        a.click();
        URL.revokeObjectURL(url);

        // Add to local history list (handling splits if defined)
        let logs = [];
        if (metadata.splits && metadata.splits.length > 0) {
          metadata.splits.forEach((split, index) => {
            logs.push({
              id: `${Date.now()}_split_${index}`,
              dateLogged: new Date().toLocaleDateString(),
              dateTransaction: metadata.date,
              description: `[${split.lotNumber || metadata.lotNumber || 'N/A'}] ${split.description || metadata.description || ''}`,
              vendor: metadata.vendor,
              costCategory: split.costCategory || 'material',
              amount: split.amount,
              link: null
            });
          });
        } else {
          logs.push({
            id: Date.now().toString(),
            dateLogged: new Date().toLocaleDateString(),
            dateTransaction: metadata.date,
            description: `[${metadata.lotNumber || 'N/A'}] ${metadata.description || ''}`,
            vendor: metadata.vendor,
            costCategory: metadata.costCategory,
            amount: metadata.amount,
            link: null, // local only
          });
        }

        saveHistory([...logs, ...history]);
        setSuccess('Document PDF generated and downloaded to device!');
        
        // Remove from drafts
        const updatedDrafts = stagedItems.filter(item => item.id !== id);
        setStagedItems(updatedDrafts);
        localStorage.setItem('jobscan_staged_items', JSON.stringify(updatedDrafts));
      } else {
        // Online Sync to Google Drive
        // Generate clean and safe file name based on: LotNumber - Description - CostCategory.pdf
        const lot = (metadata.lotNumber || 'No_Lot').trim();
        const desc = (metadata.description || 'Expense').trim().substring(0, 30).trim();
        const category = (metadata.costCategory || 'material').trim().toLowerCase();
        const rawName = `${lot} - ${desc} - ${category}.pdf`;
        const safeFileName = rawName.replace(/[\/\\:*?"<>|]/g, '_');
        
        // A. Upload PDF to Google Drive Folder
        const uploadResult = await uploadFileToDrive(
          googleToken, 
          selectedFolder.id, 
          safeFileName, 
          'application/pdf', 
          pdfBlob
        );

        // B. Update local history log items (Google Sheets log appending disabled per user request)
        const dateLoggedStr = new Date().toLocaleDateString();
        
        let logs = [];
        if (metadata.splits && metadata.splits.length > 0) {
          // Loop through split items and log each separately
          for (let index = 0; index < metadata.splits.length; index++) {
            const split = metadata.splits[index];
            logs.push({
              id: `${uploadResult.id}_split_${index}`,
              dateLogged: dateLoggedStr,
              dateTransaction: metadata.date,
              description: `[${split.lotNumber || metadata.lotNumber || 'N/A'}] ${split.description || metadata.description || ''}`,
              vendor: metadata.vendor,
              costCategory: split.costCategory || 'material',
              amount: split.amount,
              link: uploadResult.webViewLink,
            });
          }
        } else {
          logs.push({
            id: uploadResult.id,
            dateLogged: dateLoggedStr,
            dateTransaction: metadata.date,
            description: `[${metadata.lotNumber || 'N/A'}] ${metadata.description || ''}`,
            vendor: metadata.vendor,
            costCategory: metadata.costCategory,
            amount: metadata.amount,
            link: uploadResult.webViewLink,
          });
        }
        
        // C. Update local history
        saveHistory([...logs, ...history]);

        // Mark that there is a new upload that has landed in Drive
        if (activeProject?.appsScriptUrl) {
          setHasUnprocessedUploads(true);
          localStorage.setItem('jobscan_has_unprocessed_uploads', 'true');
        }

        setSuccess('Document report PDF synced successfully!');
        
        // Remove from drafts
        const updatedDrafts = stagedItems.filter(item => item.id !== id);
        setStagedItems(updatedDrafts);
        localStorage.setItem('jobscan_staged_items', JSON.stringify(updatedDrafts));
      }

      setTimeout(() => setSuccess(null), 4000);

    } catch (err) {
      console.error(err);
      if (isAuthError(err)) {
        handleSessionExpired();
      } else {
        setError(`Failed to save report: ${err.message}`);
      }
    } finally {
      setUploading(null);
    }
  };

  const handleViewPDF = async (item) => {
    if (!item.link) return;

    // Open a blank tab immediately to satisfy pop-up blockers
    const newWindow = window.open('about:blank', '_blank');
    if (newWindow) {
      newWindow.document.write(`
        <div style="
          font-family: system-ui, -apple-system, sans-serif;
          color: #fafafa;
          background: #0a0a0a;
          height: 100vh;
          margin: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 16px;
        ">
          <div style="
            width: 28px;
            height: 28px;
            border: 3px solid rgba(197, 160, 89, 0.2);
            border-top-color: #C5A059;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          "></div>
          <span style="font-size: 0.95rem; font-weight: 500; letter-spacing: 0.02em;">Retrieving PDF from Google Drive...</span>
          <style>
            @keyframes spin { to { transform: rotate(360deg); } }
          </style>
        </div>
      `);
    }

    if (googleToken) {
      try {
        const fileId = item.id.split('_split_')[0];
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: {
            Authorization: `Bearer ${googleToken}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to retrieve PDF content');
        }

        const blob = await response.blob();
        const fileURL = URL.createObjectURL(blob);
        if (newWindow) {
          newWindow.location.href = fileURL;
        } else {
          window.open(fileURL, '_blank');
        }
        return;
      } catch (err) {
        console.error('Failed to view PDF via API, falling back to web link:', err);
        if (isAuthError(err)) {
          handleSessionExpired();
        }
      }
    }

    // Fallback if not authenticated or API call fails
    if (newWindow) {
      newWindow.location.href = item.link;
    } else {
      window.open(item.link, '_blank');
    }
  };

  const isAuthError = (err) => {
    if (!err || !err.message) return false;
    const msg = err.message.toLowerCase();
    return msg.includes('401') || msg.includes('unauthenticated') || msg.includes('auth') || msg.includes('credential');
  };

  const handleSessionExpired = () => {
    setGoogleToken(null);
    setGoogleUser(null);
    localStorage.removeItem('jobscan_google_token');
    localStorage.removeItem('jobscan_google_user');
    setError('Google Drive session expired. Please sign in again.');
  };

  if (!isInvited) {
    return (
      <InviteScreen 
        onUnlocked={(email) => {
          localStorage.setItem('jobscan_authorized_email', email);
          localStorage.setItem('jobscan_invited', 'true');
          setIsInvited(true);
        }} 
        onKeyUpdated={(key) => setGeminiKey(key)}
        defaultGeminiKey={localStorage.getItem('jobscan_gemini_key') || ''}
        googleUser={googleUser}
        onGoogleSignIn={handleGoogleSignIn}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <div className="app-container">
      {/* 1. Header */}
      <header className="app-header">
        <div className="logo-section">
          <svg className="logo-icon" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="header-gold" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#C5A059" />
                <stop offset="50%" stopColor="#F1D7A7" />
                <stop offset="100%" stopColor="#B28741" />
              </linearGradient>
            </defs>
            <path d="M50 15 L80 45 V85 H71 V45 L50 24 L29 45 V85 H20 V45 Z" fill="url(#header-gold)" />
            <path fillRule="evenodd" d="M50 33.5 L66.5 50 V85 H50.5 V73 H49.5 V85 H33.5 V50 Z M50 42.5 L57.5 50 V63 H42.5 V50 Z" fill="url(#header-gold)" />
          </svg>
          <div className="logo-text-group">
            <span className="logo-main-text" style={{ fontFamily: 'var(--font-syne)', fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.12em', color: '#fff', textTransform: 'uppercase', lineHeight: 1.1 }}>
              ADEPEC
            </span>
            <div className="header-logo-homes">
              HOMES
            </div>
          </div>
        </div>

        {/* Centered Project Selector Pill (Interactive Selector) */}
        <div 
          className="header-project-section" 
          onClick={(e) => {
            e.stopPropagation();
            setShowProjectDropdown(!showProjectDropdown);
          }}
          style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowProjectDropdown(!showProjectDropdown);
            }
          }}
        >
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px', 
            fontSize: '0.78rem', 
            color: 'var(--color-zinc-300)', 
            backgroundColor: 'var(--color-zinc-900)', 
            border: '1px solid var(--color-zinc-800)', 
            padding: '5px 12px', 
            borderRadius: '20px', 
            cursor: 'pointer', 
            maxWidth: '90%',
            userSelect: 'none'
          }}>
            <span style={{ color: 'var(--color-zinc-400)', whiteSpace: 'nowrap' }}>Current Project:</span>
            <span style={{ fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
              {activeProject ? activeProject.name : 'None'}
            </span>
            <span style={{ color: 'var(--color-zinc-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
              ({selectedFolder ? selectedFolder.name : 'Set in Settings'})
            </span>
            <span style={{ fontSize: '0.55rem', color: 'var(--color-amber-500)', marginLeft: '1px', flexShrink: 0 }}>▼</span>
          </div>
          
          {showProjectDropdown && (
            /* Custom styled project dropdown popup centered */
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '240px',
              backgroundColor: 'var(--color-zinc-950)',
              border: '1px solid var(--color-zinc-800)',
              borderRadius: '8px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7)',
              zIndex: 1000,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: '8px 12px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-zinc-500)', borderBottom: '1px solid var(--color-zinc-800)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Select Project
              </div>
              <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {projects.length === 0 ? (
                  <div style={{ padding: '12px', fontSize: '0.8rem', color: 'var(--color-zinc-500)', textAlign: 'center' }}>
                    No saved projects.
                  </div>
                ) : (
                  projects.map(proj => {
                    const isActive = activeProject && activeProject.id === proj.id;
                    return (
                      <button
                        key={proj.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectActiveProject(proj.id);
                          setShowProjectDropdown(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          backgroundColor: isActive ? 'rgba(245, 158, 11, 0.05)' : 'transparent',
                          border: 'none',
                          color: isActive ? 'var(--color-amber-400)' : 'var(--color-zinc-200)',
                          textAlign: 'left',
                          fontSize: '0.82rem',
                          fontWeight: isActive ? 700 : 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          transition: 'var(--transition-all)'
                        }}
                        className="project-dropdown-item"
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {proj.name}
                        </span>
                        {isActive && <Check size={12} style={{ color: 'var(--color-amber-500)', flexShrink: 0 }} />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* 2. Main Content */}
      <main className="app-content">
        {success && <div className="alert-box alert-success">{success}</div>}
        {error && <div className="alert-box alert-error">{error}</div>}

        {activeProject?.appsScriptUrl && hasUnprocessedUploads && (
          <div className="settings-card" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            gap: '12px', 
            border: '1px solid rgba(16, 185, 129, 0.3)', 
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            padding: '10px 14px',
            borderRadius: '10px',
            marginTop: '-4px',
            marginBottom: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <Database size={16} style={{ color: 'var(--color-emerald-400)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--color-zinc-200)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Files uploaded! Sync spreadsheet?
              </span>
            </div>
            <button 
              onClick={handleTriggerAppsScriptSync}
              className="btn btn-primary" 
              style={{ 
                width: 'auto', 
                padding: '5px 12px',
                fontSize: '0.75rem',
                fontWeight: 700, 
                backgroundColor: 'var(--color-emerald-500)',
                color: '#000',
                border: 'none',
                height: '28px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              disabled={triggeringSync}
            >
              {triggeringSync ? (
                <>
                  <div className="spinner" style={{ width: '10px', height: '10px', borderWidth: '1.2px', borderColor: '#000', borderTopColor: 'transparent', margin: 0 }}></div>
                  Syncing...
                </>
              ) : (
                "Sync Now"
              )}
            </button>
          </div>
        )}

        {/* Tab view routing */}
        {editingItemId && stagedItems.find(item => item.id === editingItemId) ? (
          <EditForm 
            stagedItem={stagedItems.find(item => item.id === editingItemId)}
            onSave={handleSaveStagedEdits}
            onCancel={() => setEditingItemId(null)}
            history={history}
            stagedItems={stagedItems}
          />
        ) : activeTab === 'scanner' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Scanner 
              geminiKey={geminiKey}
              onDataExtracted={handleDataExtracted}
              onError={setError}
            />

            {/* Google Drive Sign In Banner if not signed in */}
            {!googleToken && (
              <div className="settings-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid var(--color-zinc-800)' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <Folder size={20} style={{ color: 'var(--color-amber-500)', marginTop: '2px', flex: 'none' }} />
                  <div>
                    <h4 style={{ fontWeight: 600, color: 'var(--color-zinc-200)' }}>Connect Google Drive</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-zinc-500)', lineHeight: '1.4', marginTop: '2px' }}>
                      Sign in to save PDFs directly to your Google Drive and log expense items into a Google Sheet automatically.
                    </p>
                  </div>
                </div>
                <button onClick={handleGoogleSignIn} className="btn btn-secondary" style={{ backgroundColor: '#fff', color: '#18181b', fontWeight: 700 }}>
                  <LogIn size={16} /> Sign In with Google
                </button>
              </div>
            )}

            {/* No Projects Setup Warning */}
            {projects.length === 0 && (
              <div className="settings-card" style={{ 
                display: 'flex', 
                gap: '12px', 
                alignItems: 'flex-start',
                border: '1px solid rgba(245, 158, 11, 0.25)', 
                backgroundColor: 'rgba(245, 158, 11, 0.04)',
                borderLeft: '4px solid var(--color-amber-500)'
              }}>
                <Sparkles size={20} style={{ color: 'var(--color-amber-500)', marginTop: '2px', flex: 'none' }} />
                <div>
                  <h4 style={{ fontWeight: 700, color: 'var(--color-zinc-100)', fontSize: '0.88rem' }}>No Active Project Profiles</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-zinc-400)', lineHeight: '1.4', marginTop: '3px' }}>
                    You don't have any projects set up. Please go to your **Settings** tab to create your first project.
                  </p>
                  <button 
                    onClick={() => setActiveTab('settings')} 
                    className="btn btn-secondary" 
                    style={{ width: 'auto', padding: '6px 12px', fontSize: '0.78rem', marginTop: '8px', borderColor: 'var(--color-amber-500)', color: 'var(--color-amber-400)' }}
                  >
                    Go to Settings
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'drafts' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Staged Drafts ({stagedItems.length})</h2>
              {stagedItems.length > 0 && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-zinc-500)', fontStyle: 'italic' }}>
                  Saved locally on device
                </span>
              )}
            </div>

            {!googleToken && stagedItems.length > 0 && (
              <div className="settings-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid var(--color-zinc-800)', marginBottom: '4px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <Folder size={20} style={{ color: 'var(--color-amber-500)', marginTop: '2px', flex: 'none' }} />
                  <div>
                    <h4 style={{ fontWeight: 600, color: 'var(--color-zinc-200)' }}>Connect Google Drive to Sync</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-zinc-500)', lineHeight: '1.4', marginTop: '2px' }}>
                      Sign in to sync your staged documents directly to your active project's Google Drive folder.
                    </p>
                  </div>
                </div>
                <button onClick={handleGoogleSignIn} className="btn btn-secondary" style={{ backgroundColor: '#fff', color: '#18181b', fontWeight: 700 }}>
                  <LogIn size={16} /> Sign In with Google
                </button>
              </div>
            )}
            {stagedItems.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-zinc-500)', fontSize: '0.9rem', border: '1px dashed var(--color-zinc-800)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <FileText size={24} style={{ color: 'var(--color-zinc-700)' }} />
                No staged documents. Scanned checks and receipts waiting for sync will appear here.
                <button className="btn btn-secondary" onClick={() => setActiveTab('scanner')} style={{ width: 'auto', marginTop: '8px', fontSize: '0.8rem' }}>
                  Go Scan Document
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {stagedItems.map(item => (
                  <StagingCard 
                    key={item.id}
                    stagedItem={item}
                    onEditClick={() => setEditingItemId(item.id)}
                    onUploadClick={() => handleSyncToDrive(item.id)}
                    onDeleteClick={() => handleDeleteStaged(item.id)}
                    onAdjustTimer={(minutes) => handleAdjustTimer(item.id, minutes)}
                    onResetTimer={() => handleResetTimer(item.id)}
                    onDescriptionChange={(val) => handleUpdateDraftField(item.id, 'description', val)}
                    onCostCategoryChange={(val) => handleUpdateDraftField(item.id, 'costCategory', val)}
                    onLotNumberChange={(val) => handleUpdateDraftField(item.id, 'lotNumber', val)}
                    uploading={uploading === item.id}
                    googleToken={googleToken}
                    selectedFolder={selectedFolder}
                  />
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'history' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Sync Log & History</h2>
            {history.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-zinc-500)', fontSize: '0.9rem', border: '1px dashed var(--color-zinc-800)', borderRadius: '12px' }}>
                No documents uploaded yet. Scans will be logged here.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {history.map(item => (
                  <div key={item.id} className="history-item">
                    <div className="history-info" style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                      <div className="history-title-text" style={{ wordBreak: 'break-word' }}>{item.description}</div>
                      <div className="history-meta">
                        {item.vendor} • {item.dateTransaction || 'N/A'}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: item.costCategory === 'labor' ? 'var(--color-blue-500)' : 'var(--color-amber-500)', textTransform: 'uppercase' }}>
                          {item.costCategory}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-zinc-600)' }}>•</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-zinc-500)' }}>Logged {item.dateLogged}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
                      <div className="history-price">${Number(item.amount).toFixed(2)}</div>
                      {item.link ? (
                        <button 
                          type="button"
                          onClick={() => handleViewPDF(item)}
                          className="btn btn-secondary" 
                          style={{ padding: '4px 8px', fontSize: '0.75rem', width: 'auto', borderRadius: '6px', whiteSpace: 'nowrap' }}
                        >
                          View PDF
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-zinc-600)', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                          Downloaded
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Settings 
            geminiKey={geminiKey}
            setGeminiKey={setGeminiKey}
            googleClientId={googleClientId}
            setGoogleClientId={setGoogleClientId}
            googleToken={googleToken}
            setGoogleToken={setGoogleToken}
            selectedFolder={selectedFolder}
            setSelectedFolder={setSelectedFolder}
            googleUser={googleUser}
            onSignOut={handleSignOut}
            onSignIn={handleGoogleSignIn}
            projects={projects}
            setProjects={setProjects}
            activeProject={activeProject}
            setActiveProject={setActiveProject}
            handleSelectActiveProject={handleSelectActiveProject}
          />
        )}
      </main>

      {/* 3. Navigation Footer */}
      {!editingItemId && (
        <nav className="app-nav">
          <button 
            className={`nav-item ${activeTab === 'scanner' ? 'active' : ''}`}
            onClick={() => setActiveTab('scanner')}
          >
            <Camera size={20} />
            <span>Scanner</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'drafts' ? 'active' : ''}`}
            onClick={() => setActiveTab('drafts')}
            style={{ position: 'relative' }}
          >
            <FileText size={20} />
            <span>Drafts</span>
            {stagedItems.length > 0 && (
              <span className="nav-badge">
                {stagedItems.length}
              </span>
            )}
          </button>
          <button 
            className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <History size={20} />
            <span>History</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <SettingsIcon size={20} />
            <span>Settings</span>
          </button>
        </nav>
      )}

      {/* Custom Delete Draft Confirmation Modal */}
      {draftToDelete && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1300,
          padding: '20px',
          backdropFilter: 'blur(4px)'
        }}>
          <div className="settings-card" style={{
            width: '100%',
            maxWidth: '320px',
            backgroundColor: 'var(--color-zinc-950)',
            border: '1px solid var(--color-zinc-800)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
            borderTop: '4px solid var(--color-rose-500)'
          }}>
            <div style={{ textAlign: 'center' }}>
              <h4 style={{ 
                fontWeight: 700, 
                fontSize: '1.05rem', 
                color: 'var(--color-zinc-100)',
                fontFamily: 'var(--font-serif)',
                marginBottom: '8px'
              }}>
                Discard Draft
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-zinc-400)', lineHeight: '1.4' }}>
                Are you sure you want to delete this draft?
                {draftToDelete.metadata?.description && (
                  <span style={{ display: 'block', marginTop: '6px', fontWeight: 600, color: 'var(--color-zinc-200)' }}>
                    "{draftToDelete.metadata.description}"
                  </span>
                )}
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setDraftToDelete(null)}
                style={{ padding: '8px 12px', fontSize: '0.85rem', flex: 1 }}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
                onClick={confirmDeleteDraft}
                style={{ padding: '8px 12px', fontSize: '0.85rem', flex: 1, backgroundColor: 'var(--color-rose-600)' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
