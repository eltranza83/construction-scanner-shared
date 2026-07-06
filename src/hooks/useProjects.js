import { useEffect, useState } from 'react';
import {
  APP_STORAGE_KEYS,
  loadStoredAppState,
  persistActiveProject,
  persistProjects
} from '../services/appStorage';
import {
  loadProjectsConfigFromDrive,
  resolveActiveProject,
  saveProjectsConfigToDrive
} from '../services/projectCloudSync';

export function useProjects({ googleToken, setSuccess } = {}) {
  const [selectedFolder, setSelectedFolder] = useState(() => loadStoredAppState().selectedFolder);
  const [projects, setProjects] = useState(() => loadStoredAppState().projects);
  const [activeProject, setActiveProject] = useState(() => loadStoredAppState().activeProject);

  const syncProjectsFromCloud = async (token) => {
    try {
      const cloudProjects = await loadProjectsConfigFromDrive(token, projects);
      if (!cloudProjects) return;

      setProjects(cloudProjects);
      persistProjects(cloudProjects);

      const activeProjId = localStorage.getItem(APP_STORAGE_KEYS.activeProjectId);
      const resolvedProject = resolveActiveProject(cloudProjects, activeProjId);
      if (resolvedProject) {
        setActiveProject(resolvedProject);
        setSelectedFolder({ id: resolvedProject.folderId, name: resolvedProject.folderName });
        persistActiveProject(resolvedProject);
      }
    } catch (err) {
      console.error('Failed to sync projects from Google Drive:', err);
    }
  };

  const saveProjectsToCloud = async (updatedProjects, token = googleToken) => {
    if (!token) return;
    try {
      await saveProjectsConfigToDrive(token, updatedProjects);
    } catch (err) {
      console.error('Failed to save projects to Google Drive:', err);
    }
  };

  const updateProjects = (newProjects) => {
    setProjects(newProjects);
    persistProjects(newProjects);
    if (googleToken) {
      saveProjectsToCloud(newProjects, googleToken);
    }
  };

  useEffect(() => {
    if (googleToken) {
      syncProjectsFromCloud(googleToken);
    }
  }, [googleToken]);

  const selectActiveProject = (projectId) => {
    if (!projectId) {
      setActiveProject(null);
      setSelectedFolder(null);
      persistActiveProject(null);
      return;
    }

    const proj = projects.find(p => p.id === projectId);
    if (proj) {
      setActiveProject(proj);
      setSelectedFolder({ id: proj.folderId, name: proj.folderName });
      persistActiveProject(proj);

      setSuccess?.(`Switched active project to: "${proj.name}"`);
      setTimeout(() => setSuccess?.(null), 2500);
    }
  };

  const resetProjectSelection = () => {
    setSelectedFolder(null);
    setActiveProject(null);
  };

  return {
    selectedFolder,
    setSelectedFolder,
    projects,
    activeProject,
    setActiveProject,
    updateProjects,
    selectActiveProject,
    resetProjectSelection
  };
}
