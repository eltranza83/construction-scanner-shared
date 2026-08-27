import { useEffect, useState, useCallback } from 'react';
import {
  APP_STORAGE_KEYS,
  loadStoredAppState,
  persistActiveProject,
  persistProjects
} from '../services/appStorage';
import {
  fetchUserProjects,
  saveUserProject,
  resolveUserActiveProject
} from '../services/projectService';
import {
  loadProjectsConfigFromDrive,
  saveProjectsConfigToDrive
} from '../services/projectCloudSync';

export function useProjects({ googleToken, googleUser, setSuccess } = {}) {
  const [selectedFolder, setSelectedFolder] = useState(() => loadStoredAppState().selectedFolder);
  const [projects, setProjects] = useState(() => loadStoredAppState().projects);
  const [activeProject, setActiveProject] = useState(() => loadStoredAppState().activeProject);

  const syncProjectsFromFirestore = useCallback(async (user) => {
    try {
      const cloudProjects = await fetchUserProjects(user);
      if (Array.isArray(cloudProjects) && cloudProjects.length > 0) {
        setProjects(cloudProjects);
        persistProjects(cloudProjects);

        const storedActiveId = localStorage.getItem(APP_STORAGE_KEYS.activeProjectId);
        const resolved = resolveUserActiveProject(cloudProjects, storedActiveId);
        if (resolved) {
          setActiveProject(resolved);
          setSelectedFolder({ id: resolved.folderId, name: resolved.folderName });
          persistActiveProject(resolved);
        }
      }
    } catch (err) {
      console.warn('[useProjects] Cloud sync failed:', err);
    }
  }, []);

  // Sync from Firestore whenever googleUser is present or changes
  useEffect(() => {
    if (googleUser?.email) {
      syncProjectsFromFirestore(googleUser);
    }
  }, [googleUser, syncProjectsFromFirestore]);

  // Secondary Drive sync (legacy fallback)
  useEffect(() => {
    if (googleToken && (!projects || projects.length === 0)) {
      loadProjectsConfigFromDrive(googleToken, projects)
        .then((driveProjects) => {
          if (Array.isArray(driveProjects) && driveProjects.length > 0) {
            setProjects(driveProjects);
            persistProjects(driveProjects);
            if (googleUser?.email) {
              driveProjects.forEach((p) => saveUserProject(p, googleUser));
            }
          }
        })
        .catch(() => {});
    }
  }, [googleToken, googleUser, projects]);

  const updateProjects = (newProjects) => {
    setProjects(newProjects);
    persistProjects(newProjects);
    if (googleUser?.email) {
      newProjects.forEach((p) => saveUserProject(p, googleUser));
    }
    if (googleToken) {
      saveProjectsConfigToDrive(googleToken, newProjects);
    }
  };

  const selectActiveProject = (projectId) => {
    if (!projectId) {
      setActiveProject(null);
      setSelectedFolder(null);
      persistActiveProject(null);
      return;
    }

    const proj = projects.find((p) => p.id === projectId || p.canonicalId === projectId);
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
    resetProjectSelection,
    syncProjectsFromFirestore
  };
}
