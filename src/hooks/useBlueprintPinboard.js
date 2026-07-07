import { useEffect, useRef, useState } from 'react';
import { STATUS_MESSAGES, getDriveErrorMessage, getUploadErrorMessage, getValidationErrorMessage } from '../services/appErrors';
import {
  addBlueprintPin,
  deleteBlueprintPin,
  listBlueprintPhasePhotos,
  loadBlueprintVault,
  resetBlueprintVault,
  uploadBlueprintAlbumPhoto,
  uploadBlueprintVaultFile
} from '../services/blueprintDrive';

const DEFAULT_PIN_FORM = {
  tradeCategory: 'Mechanicals_&_Utilities',
  tradePhase: 'Plumbing Rough-In',
  note: ''
};

export function useBlueprintPinboard({
  activeProject,
  googleToken,
  selectedFolder,
  tradeSectionsConfig
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [blueprintDataFileId, setBlueprintDataFileId] = useState(null);
  const [blueprintFileId, setBlueprintFileId] = useState(null);
  const [blueprintFileName, setBlueprintFileName] = useState(null);
  const [imageSrc, setImageSrc] = useState(null);
  const [pins, setPins] = useState([]);
  const [zoomScale, setZoomScale] = useState(1);
  const [isAddMode, setIsAddMode] = useState(false);
  const [selectedPin, setSelectedPin] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPinCoords, setNewPinCoords] = useState({ x: 0, y: 0 });
  const [formData, setFormData] = useState(DEFAULT_PIN_FORM);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [savingPin, setSavingPin] = useState(false);
  const [viewMode, setViewMode] = useState('blueprint');
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [activeAlbumPhase, setActiveAlbumPhase] = useState(null);
  const [albumPhotos, setAlbumPhotos] = useState([]);
  const [loadingAlbumPhotos, setLoadingAlbumPhotos] = useState(false);
  const [uploadingAlbumPhoto, setUploadingAlbumPhoto] = useState(false);
  const [fullscreenAlbumPhoto, setFullscreenAlbumPhoto] = useState(null);

  const fileInputRef = useRef(null);
  const blueprintInputRef = useRef(null);
  const imageContainerRef = useRef(null);
  const albumFileInputRef = useRef(null);
  const imageSrcRef = useRef(null);

  const clearBlueprintImage = () => {
    if (imageSrcRef.current) {
      URL.revokeObjectURL(imageSrcRef.current);
      imageSrcRef.current = null;
    }
    setImageSrc(null);
  };

  const loadBlueprintData = async () => {
    setLoading(true);
    setError(null);
    setSelectedPin(null);
    setIsAddMode(false);
    clearBlueprintImage();

    try {
      const data = await loadBlueprintVault(googleToken, selectedFolder.id);
      setBlueprintDataFileId(data.blueprintDataFileId);
      setBlueprintFileId(data.blueprintFileId);
      setBlueprintFileName(data.blueprintFileName || (data.blueprintFileId ? 'Blueprint.png' : null));
      setPins(data.pins || []);

      if (data.blueprintBlob) {
        const localUrl = URL.createObjectURL(data.blueprintBlob);
        setImageSrc(localUrl);
      }
    } catch (err) {
      console.error(err);
      setError(getDriveErrorMessage(err, 'retrieve blueprint data from Google Drive'));
    } finally {
      setLoading(false);
    }
  };

  const loadPhasePhotos = async (category, phase) => {
    setLoadingAlbumPhotos(true);
    try {
      const list = await listBlueprintPhasePhotos({
        accessToken: googleToken,
        projectFolderId: selectedFolder.id,
        category,
        phase
      });
      setAlbumPhotos(list || []);
    } catch (err) {
      console.error(err);
      setError(getDriveErrorMessage(err, 'load photos from Google Drive'));
    } finally {
      setLoadingAlbumPhotos(false);
    }
  };

  useEffect(() => {
    if (googleToken && selectedFolder?.id) {
      loadBlueprintData();
    }
  }, [googleToken, selectedFolder?.id, activeProject?.id]);

  useEffect(() => {
    if (imageSrc) {
      setViewMode('blueprint');
    } else {
      setViewMode('albums');
    }
    imageSrcRef.current = imageSrc;
  }, [imageSrc]);

  useEffect(() => {
    if (activeAlbumPhase) {
      loadPhasePhotos(activeAlbumPhase.category, activeAlbumPhase.phase);
    }
  }, [activeAlbumPhase]);

  useEffect(() => {
    return () => {
      if (imageSrcRef.current) {
        URL.revokeObjectURL(imageSrcRef.current);
      }
    };
  }, []);

  const handleUploadAlbumPhoto = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeAlbumPhase) return;

    setUploadingAlbumPhoto(true);
    setError(null);
    try {
      await uploadBlueprintAlbumPhoto({
        accessToken: googleToken,
        projectFolderId: selectedFolder.id,
        activeAlbumPhase,
        file
      });
      await loadPhasePhotos(activeAlbumPhase.category, activeAlbumPhase.phase);
      setSuccess('Progress photo uploaded successfully!');
      setTimeout(() => setSuccess(null), 2500);
    } catch (err) {
      console.error(err);
      setError(getUploadErrorMessage(err, 'progress photo'));
    } finally {
      setUploadingAlbumPhoto(false);
    }
  };

  const handleUploadBlueprint = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError(getValidationErrorMessage('Please upload your floor plan as a standard image (PNG, JPEG, WebP, or SVG). PDF support is coming soon.'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await uploadBlueprintVaultFile({
        accessToken: googleToken,
        projectFolderId: selectedFolder.id,
        projectName: activeProject?.name,
        file,
        blueprintDataFileId
      });
      await loadBlueprintData();
      setSuccess('Blueprint uploaded successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setError(getUploadErrorMessage(err, 'blueprint'));
    } finally {
      setLoading(false);
    }
  };

  const handleCanvasClick = (e) => {
    if (!isAddMode) return;

    const rect = e.target.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setNewPinCoords({ x, y });
    setFormData(DEFAULT_PIN_FORM);
    setSelectedPhoto(null);
    setPhotoPreview(null);
    setShowAddForm(true);
    setIsAddMode(false);
  };

  const handleCategoryChange = (e) => {
    const cat = e.target.value;
    const defaultPhase = tradeSectionsConfig[cat]?.phases[0] || '';
    setFormData(prev => ({
      ...prev,
      tradeCategory: cat,
      tradePhase: defaultPhase
    }));
  };

  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const clearSelectedPhoto = () => {
    setSelectedPhoto(null);
    setPhotoPreview(null);
  };

  const handleSavePin = async (e) => {
    e.preventDefault();
    if (!formData.note.trim()) {
      setError(getValidationErrorMessage('Please add a brief description of the work.'));
      return;
    }

    setSavingPin(true);
    setError(null);

    try {
      const { updatedPins } = await addBlueprintPin({
        accessToken: googleToken,
        projectFolderId: selectedFolder.id,
        blueprintDataFileId,
        blueprintFileId,
        blueprintFileName,
        pins,
        pinCoords: newPinCoords,
        formData,
        selectedPhoto
      });
      setPins(updatedPins);
      setShowAddForm(false);
      setFormData(DEFAULT_PIN_FORM);
      clearSelectedPhoto();
      setSuccess('Pin added to blueprint!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setError(getDriveErrorMessage(err, 'save pin details'));
    } finally {
      setSavingPin(false);
    }
  };

  const handleDeletePin = async (pinId) => {
    if (!window.confirm('Are you sure you want to delete this pin?')) return;

    setLoading(true);
    setError(null);

    try {
      const updatedPins = await deleteBlueprintPin({
        accessToken: googleToken,
        blueprintDataFileId,
        blueprintFileId,
        blueprintFileName,
        pins,
        pinId
      });
      setPins(updatedPins);
      setSelectedPin(null);
      setSuccess('Pin removed.');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      console.error(err);
      setError(getDriveErrorMessage(err, 'update pins data'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetBlueprint = async () => {
    if (!window.confirm('WARNING: Removing the blueprint will unlink the image and delete all coordinate pins. Do you want to continue?')) return;

    setLoading(true);
    try {
      await resetBlueprintVault(googleToken, blueprintDataFileId);
      await loadBlueprintData();
    } catch (err) {
      setError(getDriveErrorMessage(err, 'clear blueprint'));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAddMode = () => {
    setIsAddMode(!isAddMode);
    setSelectedPin(null);
  };

  const handleSelectPin = (pin) => {
    setSelectedPin(pin);
    if (pin) {
      setIsAddMode(false);
    }
  };

  return {
    activeAlbumPhase,
    albumFileInputRef,
    albumPhotos,
    blueprintInputRef,
    error,
    expandedCategory,
    fileInputRef,
    formData,
    fullscreenAlbumPhoto,
    imageContainerRef,
    imageSrc,
    isAddMode,
    loading,
    loadingAlbumPhotos,
    photoPreview,
    pins,
    savingPin,
    selectedPin,
    showAddForm,
    success,
    uploadingAlbumPhoto,
    viewMode,
    zoomScale,
    clearSelectedPhoto,
    handleCanvasClick,
    handleCategoryChange,
    handleDeletePin,
    handlePhotoSelect,
    handleResetBlueprint,
    handleSavePin,
    handleSelectPin,
    handleToggleAddMode,
    handleUploadAlbumPhoto,
    handleUploadBlueprint,
    setActiveAlbumPhase,
    setExpandedCategory,
    setFormData,
    setFullscreenAlbumPhoto,
    setShowAddForm,
    setViewMode,
    setZoomScale,
    statusMessages: STATUS_MESSAGES
  };
}
