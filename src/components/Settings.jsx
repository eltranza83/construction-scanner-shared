import React, { useState, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';
import { createProjectFolder, listProjectFolders } from '../services/settingsDrive';
import { collection, getDocs, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '../services/firebase';
import { ADMIN_PASSCODE, DEFAULT_FIREBASE_CONFIG, STORAGE_KEYS, getStoredConfigValue } from '../config/appConfig';
import { APP_STORAGE_KEYS } from '../services/appStorage';
import { getDriveErrorMessage, getFolderErrorMessage, getValidationErrorMessage } from '../services/appErrors';
import SettingsDeleteProjectModal from './SettingsDeleteProjectModal';
import SettingsFolderPickerModal from './SettingsFolderPickerModal';
import SettingsProjectModal from './SettingsProjectModal';
import SettingsAdminPanel from './SettingsAdminPanel';
import SettingsGoogleConnectionCard from './SettingsGoogleConnectionCard';
import SettingsProjectProfilesCard from './SettingsProjectProfilesCard';

export default function Settings({ 
  geminiKey: _geminiKey, 
  setGeminiKey, 
  googleClientId: _googleClientId, 
  setGoogleClientId: _setGoogleClientId, 
  googleToken, 
  setGoogleToken: _setGoogleToken,
  selectedFolder: _selectedFolder,
  setSelectedFolder,
  googleUser,
  onSignOut,
  onSignIn,
  projects,
  setProjects,
  activeProject,
  setActiveProject,
  handleSelectActiveProject
}) {
  const [folders, setFolders] = useState([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Admin & Invite management states
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminPassInput, setAdminPassInput] = useState('');
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [invites, setInvites] = useState([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  
  // Firebase credentials states
  const [firebaseApiKey, setFirebaseApiKey] = useState(getStoredConfigValue(STORAGE_KEYS.firebaseApiKey, DEFAULT_FIREBASE_CONFIG.apiKey));
  const [firebaseProjectId, setFirebaseProjectId] = useState(getStoredConfigValue(STORAGE_KEYS.firebaseProjectId, DEFAULT_FIREBASE_CONFIG.projectId));
  const [firebaseAppId, setFirebaseAppId] = useState(getStoredConfigValue(STORAGE_KEYS.firebaseAppId, DEFAULT_FIREBASE_CONFIG.appId));

  // Gemini API Key states
  const [tempGeminiKey, setTempGeminiKey] = useState('');
  const [savingGeminiKey, setSavingGeminiKey] = useState(false);

  const fetchInvitesList = async () => {
    const db = getFirebaseDb();
    if (!db) return;
    setLoadingInvites(true);
    try {
      const qSnapshot = await getDocs(collection(db, 'invites'));
      const list = [];
      qSnapshot.forEach((d) => {
        if (d.id !== 'CONFIG-GEMINI') {
          list.push({ id: d.id, ...d.data() });
        }
      });
      // Sort by createdAt desc
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate() : 0;
        return timeB - timeA;
      });
      setInvites(list);
    } catch (err) {
      console.error('Failed to fetch invites:', err);
    } finally {
      setLoadingInvites(false);
    }
  };

  const fetchSharedGeminiKey = async () => {
    const db = getFirebaseDb();
    if (!db) return;
    try {
      const docRef = doc(db, 'invites', 'CONFIG-GEMINI');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.apiKey) {
          setTempGeminiKey(data.apiKey);
        }
      }
    } catch (err) {
      console.error('Failed to fetch shared Gemini key:', err);
    }
  };

  useEffect(() => {
    if (isAdminUnlocked) {
      fetchInvitesList();
      fetchSharedGeminiKey();
    }
  }, [isAdminUnlocked]);

  const handleGenerateInvite = async () => {
    const db = getFirebaseDb();
    if (!db) {
      setError('Database not configured. Set up Firebase below first.');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      // Generate a code: ADPC-XXXX-XXXX
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345689';
      const genPart = () => {
        let p = '';
        for (let i = 0; i < 4; i++) {
          p += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return p;
      };
      const code = `ADPC-${genPart()}-${genPart()}`;
      
      await setDoc(doc(db, 'invites', code), {
        used: false,
        createdAt: new Date(),
        usedAt: null
      });
      
      setSuccess(`Generated invite code: ${code}`);
      fetchInvitesList();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      console.error(err);
      setError('Failed to generate invite code. Check database configuration.');
    }
  };

  const handleShareInvite = async (code) => {
    const inviteLink = `${window.location.origin}?code=${code}`;
    const message = `Hey! Here is your private invite link for the Adepec Homes Construction Scanner:\n\n👉 ${inviteLink}\n\nJust open the link and tap "Activate Access"!`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Adepec Homes Scanner Invite',
          text: message,
          url: inviteLink
        });
      } catch (err) {
        console.log('Share cancelled or failed:', err);
      }
    } else {
      // Fallback: Copy to clipboard
      try {
        await navigator.clipboard.writeText(message);
        setSuccess('Invite details copied to clipboard! You can now paste and send it.');
        setTimeout(() => setSuccess(null), 4000);
      } catch (err) {
        console.error('Failed to copy:', err);
        setError('Failed to copy to clipboard.');
      }
    }
  };

  const handleDeleteInvite = async (code) => {
    const db = getFirebaseDb();
    if (!db) return;
    if (!window.confirm(`Deactivate/delete invite code: ${code}?`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await deleteDoc(doc(db, 'invites', code));
      setSuccess(`Deactivated invite code: ${code}`);
      fetchInvitesList();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setError('Failed to deactivate invite code.');
    }
  };

  const handleSaveFirebaseConfig = () => {
    if (!firebaseApiKey.trim() || !firebaseProjectId.trim()) {
      setError('Firebase API Key and Project ID are required.');
      return;
    }
    localStorage.setItem(STORAGE_KEYS.firebaseApiKey, firebaseApiKey.trim());
    localStorage.setItem(STORAGE_KEYS.firebaseProjectId, firebaseProjectId.trim());
    localStorage.setItem(STORAGE_KEYS.firebaseAppId, firebaseAppId.trim());
    setSuccess('Firebase configuration saved successfully!');
    setError(null);
    setTimeout(() => {
      setSuccess(null);
      window.location.reload();
    }, 1500);
  };

  const handleSaveSharedGeminiKey = async () => {
    const db = getFirebaseDb();
    if (!db) {
      setError('Database not configured. Set up Firebase below first.');
      return;
    }
    setError(null);
    setSuccess(null);
    setSavingGeminiKey(true);
    try {
      await setDoc(doc(db, 'invites', 'CONFIG-GEMINI'), {
        apiKey: tempGeminiKey.trim(),
        updatedAt: new Date()
      });
      setSuccess('Shared Gemini API Key saved to database! Other users will receive it automatically on next load.');
      
      // Update local state and storage
      setGeminiKey(tempGeminiKey.trim());
      localStorage.setItem(APP_STORAGE_KEYS.geminiKey, tempGeminiKey.trim());
      
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      console.error(err);
      setError('Failed to save Gemini API Key to database.');
    } finally {
      setSavingGeminiKey(false);
    }
  };

  // Folder Explorer Navigation States
  const [currentParentId, setCurrentParentId] = useState('root');
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: 'root', name: 'My Drive' }]);

  // Redesign state variables
  const [projectNameInput, setProjectNameInput] = useState('');
  const [appsScriptUrlInput, setAppsScriptUrlInput] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFolderPickerModal, setShowFolderPickerModal] = useState(false);
  const [showProjectsAccordion, setShowProjectsAccordion] = useState(false);
  const [tempSelectedFolder, setTempSelectedFolder] = useState(null);
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [editingProject, setEditingProject] = useState(null);

  const handleSaveProject = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!projectNameInput.trim()) {
      setError(getValidationErrorMessage('Please enter a Project Name'));
      return;
    }
    if (!tempSelectedFolder) {
      setError(getValidationErrorMessage('Please select a target Google Drive folder first'));
      return;
    }

    if (editingProject) {
      // Edit existing project
      const updatedProjects = projects.map(p => {
        if (p.id === editingProject.id) {
          return {
            ...p,
            name: projectNameInput.trim(),
            folderId: tempSelectedFolder.id,
            folderName: tempSelectedFolder.name,
            appsScriptUrl: appsScriptUrlInput.trim() || ''
          };
        }
        return p;
      });
      setProjects(updatedProjects);
      localStorage.setItem('jobscan_projects', JSON.stringify(updatedProjects));

      const updatedProj = updatedProjects.find(p => p.id === editingProject.id);

      // If the edited project is the active one, update it in activeProject state/localStorage
      if (activeProject && activeProject.id === editingProject.id) {
        setActiveProject(updatedProj);
        localStorage.setItem('jobscan_active_project', JSON.stringify(updatedProj));
        
        setSelectedFolder({ id: updatedProj.folderId, name: updatedProj.folderName });
        localStorage.setItem('jobscan_folder_id', updatedProj.folderId);
        localStorage.setItem('jobscan_folder_name', updatedProj.folderName);
      }

      setProjectNameInput('');
      setAppsScriptUrlInput('');
      setTempSelectedFolder(null);
      setEditingProject(null);
      setShowCreateModal(false);
      setSuccess(`Project "${updatedProj.name}" updated successfully!`);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      // Create new project
      if (projects.some(p => p.name.toLowerCase() === projectNameInput.trim().toLowerCase())) {
        setError(`A project named "${projectNameInput.trim()}" already exists.`);
        return;
      }

      const newProj = {
        id: `proj_${Date.now()}`,
        name: projectNameInput.trim(),
        folderId: tempSelectedFolder.id,
        folderName: tempSelectedFolder.name,
        appsScriptUrl: appsScriptUrlInput.trim() || ''
      };

      const updatedProjects = [...projects, newProj];
      setProjects(updatedProjects);
      localStorage.setItem('jobscan_projects', JSON.stringify(updatedProjects));

      // Automatically set the new project as active
      setActiveProject(newProj);
      localStorage.setItem('jobscan_active_project', JSON.stringify(newProj));

      // Update global selected folder to match active project
      setSelectedFolder({ id: newProj.folderId, name: newProj.folderName });
      localStorage.setItem('jobscan_folder_id', newProj.folderId);
      localStorage.setItem('jobscan_folder_name', newProj.folderName);

      setProjectNameInput('');
      setAppsScriptUrlInput('');
      setTempSelectedFolder(null);
      setShowCreateModal(false);
      setSuccess(`Project "${newProj.name}" saved and set as active!`);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleCancelCreateProject = () => {
    setProjectNameInput('');
    setAppsScriptUrlInput('');
    setTempSelectedFolder(null);
    setEditingProject(null);
    setShowCreateModal(false);
    setError(null);
  };

  const confirmDeleteProject = () => {
    if (!projectToDelete) return;
    const projectId = projectToDelete.id;
    const updatedProjects = projects.filter(p => p.id !== projectId);
    setProjects(updatedProjects);
    localStorage.setItem('jobscan_projects', JSON.stringify(updatedProjects));

    if (activeProject && activeProject.id === projectId) {
      setActiveProject(null);
      localStorage.setItem('jobscan_active_project', 'null');
      setSelectedFolder(null);
      localStorage.removeItem('jobscan_folder_id');
      localStorage.removeItem('jobscan_folder_name');
    }

    setSuccess(`Project "${projectToDelete.name}" deleted.`);
    setProjectToDelete(null);
    setTimeout(() => setSuccess(null), 2500);
  };

  // Load folders once authenticated or when parent directory changes
  useEffect(() => {
    if (googleToken && showFolderPickerModal) {
      fetchFolders(currentParentId);
    }
  }, [googleToken, currentParentId, showFolderPickerModal]);

  const fetchFolders = async (parentId = 'root') => {
    setLoadingFolders(true);
    setError(null);
    try {
      const folderList = await listProjectFolders(googleToken, parentId);
      setFolders(folderList);
    } catch (err) {
      console.error(err);
      setError(getFolderErrorMessage(err, 'load Google Drive folders'));
    } finally {
      setLoadingFolders(false);
    }
  };

  const handleCreateFolder = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!newFolderName.trim()) return;

    setError(null);
    setSuccess(null);
    try {
      await createProjectFolder(
        googleToken, 
        newFolderName.trim(), 
        currentParentId === 'root' ? null : currentParentId
      );
      setSuccess(`Folder "${newFolderName}" created successfully!`);
      setNewFolderName('');
      await fetchFolders(currentParentId); // refresh current view
    } catch (err) {
      console.error(err);
      setError(getDriveErrorMessage(err, 'create folder'));
    }
  };

  const handleVerifyAdmin = () => {
    if (adminPassInput === ADMIN_PASSCODE) {
      setIsAdminUnlocked(true);
      setError(null);
    } else {
      setError('Incorrect Admin Passcode.');
    }
  };

  const handleNavigateToCrumb = (crumb, index) => {
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    setCurrentParentId(crumb.id);
  };

  const handleOpenFolder = (folder) => {
    setBreadcrumbs([...breadcrumbs, { id: folder.id, name: folder.name }]);
    setCurrentParentId(folder.id);
  };

  const handleSelectFolderForProject = (folder) => {
    setTempSelectedFolder({ id: folder.id, name: folder.name });
    if (!projectNameInput.trim()) {
      setProjectNameInput(folder.name);
    }
    setShowFolderPickerModal(false);
    setSuccess(`Linked folder: "${folder.name}"`);
    setTimeout(() => setSuccess(null), 2500);
  };

  const handleUseCurrentFolder = () => {
    const currentFolder = breadcrumbs[breadcrumbs.length - 1];
    handleSelectFolderForProject(currentFolder);
  };

  return (
    <div className="settings-section">
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '10px' }}>Application Settings</h2>
      
      {success && <div className="alert-box alert-success">{success}</div>}
      {error && <div className="alert-box alert-error">{error}</div>}

      <SettingsGoogleConnectionCard
        googleToken={googleToken}
        googleUser={googleUser}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
      />

      {googleToken && (
        <SettingsProjectProfilesCard
          activeProject={activeProject}
          isOpen={showProjectsAccordion}
          projects={projects}
          onCreateProject={() => {
            setProjectNameInput('');
            setTempSelectedFolder(null);
            setShowCreateModal(true);
          }}
          onDeleteProject={setProjectToDelete}
          onEditProject={(project) => {
            setEditingProject(project);
            setProjectNameInput(project.name);
            setAppsScriptUrlInput(project.appsScriptUrl || '');
            setTempSelectedFolder({ id: project.folderId, name: project.folderName });
            setShowCreateModal(true);
          }}
          onSelectActiveProject={handleSelectActiveProject}
          onToggleOpen={() => setShowProjectsAccordion(!showProjectsAccordion)}
        />
      )}
      {/* 3. Help Card / How it works */}
      <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', marginTop: '4px' }}>
        <h3 className="settings-title" style={{ color: 'var(--color-zinc-200)', marginBottom: '8px' }}>
          <HelpCircle size={18} style={{ color: 'var(--color-amber-500)' }} />
          How it works
        </h3>
        <ol style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', color: 'var(--color-zinc-400)', lineHeight: '1.5' }}>
          <li>Snap a photo of your receipt or check using your camera, or select an existing image from your gallery.</li>
          <li>The AI extracts description, totals, and category.</li>
          <li>Review details and optionally attach a receipt before uploading to Drive.</li>
        </ol>
      </div>

      <SettingsAdminPanel
        adminPassInput={adminPassInput}
        firebaseApiKey={firebaseApiKey}
        firebaseAppId={firebaseAppId}
        firebaseProjectId={firebaseProjectId}
        invites={invites}
        isAdminUnlocked={isAdminUnlocked}
        loadingInvites={loadingInvites}
        savingGeminiKey={savingGeminiKey}
        showAdminPanel={showAdminPanel}
        tempGeminiKey={tempGeminiKey}
        onAdminPassInputChange={setAdminPassInput}
        onDeleteInvite={handleDeleteInvite}
        onFirebaseApiKeyChange={setFirebaseApiKey}
        onFirebaseAppIdChange={setFirebaseAppId}
        onFirebaseProjectIdChange={setFirebaseProjectId}
        onGenerateInvite={handleGenerateInvite}
        onSaveFirebaseConfig={handleSaveFirebaseConfig}
        onSaveSharedGeminiKey={handleSaveSharedGeminiKey}
        onShareInvite={handleShareInvite}
        onTempGeminiKeyChange={setTempGeminiKey}
        onToggleAdminPanel={() => setShowAdminPanel(!showAdminPanel)}
        onVerifyAdmin={handleVerifyAdmin}
      />
      <SettingsDeleteProjectModal
        project={projectToDelete}
        onCancel={() => setProjectToDelete(null)}
        onConfirm={confirmDeleteProject}
      />

      <SettingsProjectModal
        isOpen={showCreateModal}
        editingProject={editingProject}
        projectName={projectNameInput}
        appsScriptUrl={appsScriptUrlInput}
        selectedFolder={tempSelectedFolder}
        onProjectNameChange={setProjectNameInput}
        onAppsScriptUrlChange={setAppsScriptUrlInput}
        onOpenFolderPicker={() => setShowFolderPickerModal(true)}
        onCancel={handleCancelCreateProject}
        onSave={handleSaveProject}
      />

      <SettingsFolderPickerModal
        isOpen={showFolderPickerModal}
        folders={folders}
        loadingFolders={loadingFolders}
        breadcrumbs={breadcrumbs}
        currentParentId={currentParentId}
        selectedFolder={tempSelectedFolder}
        newFolderName={newFolderName}
        canCreateFolder={!!newFolderName.trim()}
        onClose={() => setShowFolderPickerModal(false)}
        onNavigateToCrumb={handleNavigateToCrumb}
        onOpenFolder={handleOpenFolder}
        onSelectFolder={handleSelectFolderForProject}
        onUseCurrentFolder={handleUseCurrentFolder}
        onNewFolderNameChange={setNewFolderName}
        onCreateFolder={handleCreateFolder}
      />
    </div>
  );
}
