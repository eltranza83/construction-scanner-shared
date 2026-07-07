import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin, X, ZoomIn, ZoomOut, RotateCcw,
  AlertTriangle, Loader2,
} from 'lucide-react';
import { getDriveErrorMessage, getUploadErrorMessage } from '../services/appErrors';
import {
  addBlueprintPin,
  deleteBlueprintPin,
  listBlueprintPhasePhotos,
  loadBlueprintVault,
  resetBlueprintVault,
  uploadBlueprintAlbumPhoto,
  uploadBlueprintVaultFile
} from '../services/blueprintDrive';
import BlueprintAddPinModal from './BlueprintAddPinModal';
import BlueprintFullscreenPhotoModal from './BlueprintFullscreenPhotoModal';
import BlueprintPhaseAlbums from './BlueprintPhaseAlbums';
import BlueprintSelectedPinCard from './BlueprintSelectedPinCard';
import BlueprintSetupPrompt from './BlueprintSetupPrompt';

// Subcontractor categories and phases matching EditForm config
export const TRADE_SECTIONS_CONFIG = {
  'Mechanicals_&_Utilities': {
    label: 'Mechanicals & Utilities',
    color: '#C5A059', // Gold
    phases: ['Plumbing Rough-In', 'Electrical & Lighting', 'HVAC / AC Systems', 'Insulation & Alarms']
  },
  'Framing_&_Lumber': {
    label: 'Framing & Lumber',
    color: '#3b82f6', // Blue
    phases: ['Framing & Lumber']
  },
  'Site_Prep_&_Structure': {
    label: 'Site Prep & Structure',
    color: '#10b981', // Emerald Green
    phases: ['Foundation & Flatwork', 'Roofing', 'Windows & Exterior Doors']
  },
  'Interior_Finishes': {
    label: 'Interior Finishes',
    color: '#f43f5e', // Rose
    phases: ['Drywall & Sheetrock', 'Cabinets & Trim Carpentry', 'Quartz & Countertops', 'Glass Work']
  },
  'Paint_Tile': {
    label: 'Paint & Tile',
    color: '#a855f7', // Purple
    phases: ['Tile', 'Paint']
  },
  'House_Exterior_&_Yard': {
    label: 'House Exterior & Yard',
    color: '#f97316', // Orange
    phases: ['Stucco & Masonry', 'Garage Doors', 'Driveway & Sidewalks', 'Cantera Stone Detail', 'Fencing & Gates', 'Landscaping & Irrigation']
  },
  'Project_Overhead_&_Bills': {
    label: 'Project Overhead & Bills',
    color: '#71717a', // Zinc
    phases: ['Monthly Utility Bills', 'Dumpsters & Cleaning', 'Extra Costs & Misc']
  },
  'Paperwork_&_Permits': {
    label: 'Paperwork & Permits',
    color: '#14b8a6', // Teal
    phases: ['Paperwork & Permits']
  },
  'Interior_Hardware': {
    label: 'Interior Hardware',
    color: '#6366f1', // Indigo
    phases: ['Plumbing Hardware Fixtures', 'Electrical Hardware Fixtures']
  }
};

export default function BlueprintPinboard({ googleToken, activeProject, selectedFolder }) {
  // Config & State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  const [blueprintDataFileId, setBlueprintDataFileId] = useState(null);
  const [blueprintFileId, setBlueprintFileId] = useState(null);
  const [blueprintFileName, setBlueprintFileName] = useState(null);
  const [imageSrc, setImageSrc] = useState(null);
  const [pins, setPins] = useState([]);
  
  // Interactive navigation states
  const [zoomScale, setZoomScale] = useState(1);
  const [isAddMode, setIsAddMode] = useState(false);
  const [selectedPin, setSelectedPin] = useState(null);
  
  // New pin form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPinCoords, setNewPinCoords] = useState({ x: 0, y: 0 });
  const [formData, setFormData] = useState({
    tradeCategory: 'Mechanicals_&_Utilities',
    tradePhase: 'Plumbing Rough-In',
    note: ''
  });
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [savingPin, setSavingPin] = useState(false);

  // View mode and album states
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

  // Initialize and load blueprint data
  useEffect(() => {
    if (googleToken && selectedFolder?.id) {
      loadBlueprintData();
    }
  }, [googleToken, selectedFolder?.id, activeProject?.id]);

  // Adjust view mode based on blueprint image presence
  useEffect(() => {
    if (imageSrc) {
      setViewMode('blueprint');
    } else {
      setViewMode('albums');
    }
  }, [imageSrc]);

  // Fetch photos automatically when active phase album is selected
  useEffect(() => {
    if (activeAlbumPhase) {
      loadPhasePhotos(activeAlbumPhase.category, activeAlbumPhase.phase);
    }
  }, [activeAlbumPhase]);

  // Load photos stream inside album
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

  // Upload photo from within the album view
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

  // Cleanup Object URL on unmount
  useEffect(() => {
    return () => {
      if (imageSrc) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [imageSrc]);

  // Load blueprint_data.json and image binary from Google Drive
  const loadBlueprintData = async () => {
    setLoading(true);
    setError(null);
    setSelectedPin(null);
    setIsAddMode(false);
    
    if (imageSrc) {
      URL.revokeObjectURL(imageSrc);
      setImageSrc(null);
    }

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

  // Upload blueprint file and create config
  const handleUploadBlueprint = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Filter for images only
    if (!file.type.startsWith('image/')) {
      setError('Please upload your floor plan as a standard image (PNG, JPEG, WebP, or SVG). PDF support is coming soon.');
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

  // Handle tap/click on blueprint canvas
  const handleCanvasClick = (e) => {
    if (!isAddMode) return;
    
    const rect = e.target.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    setNewPinCoords({ x, y });
    setFormData({
      tradeCategory: 'Mechanicals_&_Utilities',
      tradePhase: 'Plumbing Rough-In',
      note: ''
    });
    setSelectedPhoto(null);
    setPhotoPreview(null);
    setShowAddForm(true);
    setIsAddMode(false); // turn off add mode now that coordinates are captured
  };

  // Handle Category dropchange to match default phase
  const handleCategoryChange = (e) => {
    const cat = e.target.value;
    const defaultPhase = TRADE_SECTIONS_CONFIG[cat]?.phases[0] || '';
    setFormData(prev => ({
      ...prev,
      tradeCategory: cat,
      tradePhase: defaultPhase
    }));
  };

  // Photo Selector handle
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

  // Save new pin to Local State and Google Drive blueprint_data.json
  const handleSavePin = async (e) => {
    e.preventDefault();
    if (!formData.note.trim()) {
      setError('Please add a brief description of the work.');
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
      setFormData({ tradeCategory: 'Mechanicals_&_Utilities', tradePhase: 'Plumbing Rough-In', note: '' });
      setSelectedPhoto(null);
      setPhotoPreview(null);
      setSuccess('Pin added to blueprint!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setError(getDriveErrorMessage(err, 'save pin details'));
    } finally {
      setSavingPin(false);
    }
  };

  // Delete an existing pin
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

  // Reset blueprint image configuration
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      {/* Messages */}
      {success && <div className="alert-box alert-success">{success}</div>}
      {error && <div className="alert-box alert-error">{error}</div>}

      {/* View Mode Toggle (Only if blueprint exists) */}
      {!loading && imageSrc && (
        <div style={{ display: 'flex', gap: '8px', padding: '2px', backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-800)', borderRadius: '8px', width: 'fit-content' }}>
          <button
            onClick={() => setViewMode('blueprint')}
            style={{
              padding: '6px 12px',
              fontSize: '0.74rem',
              fontWeight: 700,
              borderRadius: '6px',
              border: 'none',
              backgroundColor: viewMode === 'blueprint' ? 'var(--color-amber-500)' : 'transparent',
              color: viewMode === 'blueprint' ? '#000' : 'var(--color-zinc-400)',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            Floor Plan View
          </button>
          <button
            onClick={() => setViewMode('albums')}
            style={{
              padding: '6px 12px',
              fontSize: '0.74rem',
              fontWeight: 700,
              borderRadius: '6px',
              border: 'none',
              backgroundColor: viewMode === 'albums' ? 'var(--color-amber-500)' : 'transparent',
              color: viewMode === 'albums' ? '#000' : 'var(--color-zinc-400)',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            Phase Albums
          </button>
        </div>
      )}

      {/* Loading Overlay */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '12px' }}>
          <Loader2 className="animate-spin" size={32} style={{ color: 'var(--color-amber-500)' }} />
          <span style={{ fontSize: '0.85rem', color: 'var(--color-zinc-400)' }}>Syncing blueprint vault...</span>
        </div>
      ) : viewMode === 'albums' ? (
        <BlueprintPhaseAlbums
          activeAlbumPhase={activeAlbumPhase}
          albumFileInputRef={albumFileInputRef}
          albumPhotos={albumPhotos}
          expandedCategory={expandedCategory}
          imageSrc={imageSrc}
          loadingAlbumPhotos={loadingAlbumPhotos}
          onBackToBlueprint={() => setViewMode('blueprint')}
          onExpandCategory={setExpandedCategory}
          onPhotoUpload={handleUploadAlbumPhoto}
          onSelectAlbumPhase={setActiveAlbumPhase}
          onSelectFullscreenPhoto={setFullscreenAlbumPhoto}
          tradeSectionsConfig={TRADE_SECTIONS_CONFIG}
          uploadingAlbumPhoto={uploadingAlbumPhoto}
        />
      ) : !imageSrc ? (
        <BlueprintSetupPrompt
          blueprintInputRef={blueprintInputRef}
          onUploadBlueprint={handleUploadBlueprint}
        />
      ) : (
        /* Interactive Blueprint View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
          
          {/* Controls Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-800)', padding: '10px 14px', borderRadius: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-zinc-400)', fontWeight: 600 }}>Interactive Blueprint</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>{pins.length} active installation pins</span>
            </div>
            
            <div style={{ display: 'flex', gap: '8px' }}>
              {/* Add Pin Button Toggle */}
              <button
                onClick={() => {
                  setIsAddMode(!isAddMode);
                  setSelectedPin(null);
                }}
                className={`btn ${isAddMode ? 'btn-primary' : ''}`}
                style={{
                  width: 'auto',
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: isAddMode ? 'var(--color-emerald-500)' : 'var(--color-zinc-800)',
                  color: isAddMode ? '#000' : '#fff',
                  border: 'none',
                  height: '32px'
                }}
              >
                <MapPin size={14} className={isAddMode ? 'animate-pulse' : ''} />
                {isAddMode ? 'Tap Canvas...' : 'Add Pin'}
              </button>

              {/* Reset Blueprint */}
              <button
                onClick={handleResetBlueprint}
                style={{
                  width: '32px',
                  height: '32px',
                  backgroundColor: 'var(--color-zinc-800)',
                  border: 'none',
                  color: 'var(--color-rose-500)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Reset Blueprint"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Add Pin Notice */}
          {isAddMode && (
            <div style={{ padding: '8px 12px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={14} style={{ color: 'var(--color-emerald-400)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.74rem', color: 'var(--color-emerald-400)' }}>
                Tap anywhere on the floor plan below to drop a pin.
              </span>
            </div>
          )}

          {/* Canvas Window */}
          <div 
            style={{ 
              position: 'relative', 
              border: '1px solid var(--color-zinc-800)', 
              borderRadius: '12px', 
              overflow: 'auto', 
              maxHeight: '450px',
              backgroundColor: '#0c0c0e',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '260px'
            }}
            ref={imageContainerRef}
          >
            <div 
              style={{ 
                position: 'relative', 
                transform: `scale(${zoomScale})`, 
                transformOrigin: 'center center', 
                transition: 'transform 0.15s ease-out',
                display: 'inline-block',
                cursor: isAddMode ? 'crosshair' : 'default'
              }}
            >
              <img 
                src={imageSrc} 
                alt="Project Floor Plan"
                onClick={handleCanvasClick}
                style={{ 
                  display: 'block', 
                  maxWidth: '100%', 
                  height: 'auto',
                  pointerEvents: 'auto'
                }} 
              />
              
              {/* Pins Layer */}
              {pins.map(pin => {
                const config = TRADE_SECTIONS_CONFIG[pin.category] || { color: '#71717a' };
                const isSelected = selectedPin?.id === pin.id;
                
                return (
                  <div
                    key={pin.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPin(pin);
                      setIsAddMode(false);
                    }}
                    style={{
                      position: 'absolute',
                      left: `${pin.x}%`,
                      top: `${pin.y}%`,
                      transform: 'translate(-50%, -50%)',
                      width: isSelected ? '20px' : '14px',
                      height: isSelected ? '20px' : '14px',
                      borderRadius: '50%',
                      backgroundColor: config.color,
                      border: '2px solid #fff',
                      cursor: 'pointer',
                      boxShadow: '0 0 10px rgba(0,0,0,0.5)',
                      zIndex: isSelected ? 100 : 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease'
                    }}
                    className={isSelected ? '' : 'animate-pulse'}
                  >
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#fff' }} />
                  </div>
                );
              })}
            </div>

            {/* Zoom Floating Buttons */}
            <div style={{ position: 'absolute', bottom: '12px', right: '12px', display: 'flex', flexDirection: 'column', gap: '6px', zIndex: 50 }}>
              <button 
                onClick={() => setZoomScale(s => Math.min(s + 0.25, 3.0))}
                style={{ width: '28px', height: '28px', backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-800)', borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <ZoomIn size={14} style={{ margin: 'auto' }} />
              </button>
              <button 
                onClick={() => setZoomScale(s => Math.max(s - 0.25, 0.75))}
                style={{ width: '28px', height: '28px', backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-800)', borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', justifyCenter: 'center', cursor: 'pointer' }}
              >
                <ZoomOut size={14} style={{ margin: 'auto' }} />
              </button>
              <button 
                onClick={() => setZoomScale(1)}
                style={{ width: '28px', height: '28px', backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-800)', borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', justifyCenter: 'center', cursor: 'pointer' }}
              >
                <RotateCcw size={12} style={{ margin: 'auto' }} />
              </button>
            </div>
          </div>

          {/* Selected Pin Details Card */}
          <BlueprintSelectedPinCard
            pin={selectedPin}
            tradeSectionsConfig={TRADE_SECTIONS_CONFIG}
            onClose={() => setSelectedPin(null)}
            onDelete={handleDeletePin}
          />
        </div>
      )}

      <BlueprintAddPinModal
        isOpen={showAddForm}
        formData={formData}
        tradeSectionsConfig={TRADE_SECTIONS_CONFIG}
        photoPreview={photoPreview}
        savingPin={savingPin}
        fileInputRef={fileInputRef}
        onCategoryChange={handleCategoryChange}
        onFormDataChange={setFormData}
        onPhotoSelect={handlePhotoSelect}
        onClearPhoto={() => {
          setSelectedPhoto(null);
          setPhotoPreview(null);
        }}
        onCancel={() => setShowAddForm(false)}
        onSave={handleSavePin}
      />
      <BlueprintFullscreenPhotoModal
        photo={fullscreenAlbumPhoto}
        onClose={() => setFullscreenAlbumPhoto(null)}
      />
    </div>
  );
}
