import React, { useState } from 'react';
import SettingsDeleteProjectModal from './SettingsDeleteProjectModal';
import SettingsFolderPickerModal from './SettingsFolderPickerModal';
import SettingsProjectModal from './SettingsProjectModal';
import SettingsAdminPanel from './SettingsAdminPanel';
import SettingsGoogleConnectionCard from './SettingsGoogleConnectionCard';
import SettingsHelpCard from './SettingsHelpCard';
import SettingsProjectProfilesCard from './SettingsProjectProfilesCard';
import { useSettingsAdmin } from '../hooks/useSettingsAdmin';
import { useSettingsProjects } from '../hooks/useSettingsProjects';

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
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const admin = useSettingsAdmin({
    setGeminiKey,
    setError,
    setSuccess
  });

  const projectSettings = useSettingsProjects({
    activeProject,
    googleToken,
    projects,
    setActiveProject,
    setError,
    setProjects,
    setSelectedFolder,
    setSuccess
  });

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
          isOpen={projectSettings.showProjectsAccordion}
          projects={projects}
          onCreateProject={projectSettings.openCreateProjectModal}
          onDeleteProject={projectSettings.setProjectToDelete}
          onEditProject={projectSettings.openEditProjectModal}
          onSelectActiveProject={handleSelectActiveProject}
          onToggleOpen={() => projectSettings.setShowProjectsAccordion(!projectSettings.showProjectsAccordion)}
        />
      )}

      <SettingsHelpCard />

      <SettingsAdminPanel
        adminPassInput={admin.adminPassInput}
        firebaseApiKey={admin.firebaseApiKey}
        firebaseAppId={admin.firebaseAppId}
        firebaseProjectId={admin.firebaseProjectId}
        invites={admin.invites}
        isAdminUnlocked={admin.isAdminUnlocked}
        loadingInvites={admin.loadingInvites}
        savingGeminiKey={admin.savingGeminiKey}
        showAdminPanel={admin.showAdminPanel}
        tempGeminiKey={admin.tempGeminiKey}
        onAdminPassInputChange={admin.setAdminPassInput}
        onDeleteInvite={admin.handleDeleteInvite}
        onFirebaseApiKeyChange={admin.setFirebaseApiKey}
        onFirebaseAppIdChange={admin.setFirebaseAppId}
        onFirebaseProjectIdChange={admin.setFirebaseProjectId}
        onGenerateInvite={admin.handleGenerateInvite}
        onSaveFirebaseConfig={admin.handleSaveFirebaseConfig}
        onSaveSharedGeminiKey={admin.handleSaveSharedGeminiKey}
        onShareInvite={admin.handleShareInvite}
        onTempGeminiKeyChange={admin.setTempGeminiKey}
        onToggleAdminPanel={() => admin.setShowAdminPanel(!admin.showAdminPanel)}
        onVerifyAdmin={admin.handleVerifyAdmin}
      />

      <SettingsDeleteProjectModal
        project={projectSettings.projectToDelete}
        onCancel={() => projectSettings.setProjectToDelete(null)}
        onConfirm={projectSettings.confirmDeleteProject}
      />

      <SettingsProjectModal
        isOpen={projectSettings.showCreateModal}
        editingProject={projectSettings.editingProject}
        projectName={projectSettings.projectNameInput}
        appsScriptUrl={projectSettings.appsScriptUrlInput}
        selectedFolder={projectSettings.tempSelectedFolder}
        onProjectNameChange={projectSettings.setProjectNameInput}
        onAppsScriptUrlChange={projectSettings.setAppsScriptUrlInput}
        onOpenFolderPicker={() => projectSettings.setShowFolderPickerModal(true)}
        onCancel={projectSettings.handleCancelCreateProject}
        onSave={projectSettings.handleSaveProject}
      />

      <SettingsFolderPickerModal
        isOpen={projectSettings.showFolderPickerModal}
        folders={projectSettings.folders}
        loadingFolders={projectSettings.loadingFolders}
        breadcrumbs={projectSettings.breadcrumbs}
        currentParentId={projectSettings.currentParentId}
        selectedFolder={projectSettings.tempSelectedFolder}
        newFolderName={projectSettings.newFolderName}
        canCreateFolder={!!projectSettings.newFolderName.trim()}
        onClose={() => projectSettings.setShowFolderPickerModal(false)}
        onNavigateToCrumb={projectSettings.handleNavigateToCrumb}
        onOpenFolder={projectSettings.handleOpenFolder}
        onSelectFolder={projectSettings.handleSelectFolderForProject}
        onUseCurrentFolder={projectSettings.handleUseCurrentFolder}
        onNewFolderNameChange={projectSettings.setNewFolderName}
        onCreateFolder={projectSettings.handleCreateFolder}
      />
    </div>
  );
}
