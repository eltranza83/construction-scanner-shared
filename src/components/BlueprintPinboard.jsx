import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, Camera, Image, X, ZoomIn, ZoomOut, RotateCcw, 
  AlertTriangle, Eye, Loader2,
  ChevronDown, ChevronUp, ArrowLeft
} from 'lucide-react';
import { 
  findFileInFolder, 
  getFileContent, 
  uploadFileToDrive, 
  updateFileContent, 
  uploadPhotoToPhaseFolder,
  findOrCreateFolder,
  listPhotosInPhase
} from '../services/googleDrive';

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
    phases: ['Tile & Flooring', 'Paint & Finishes']
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
      const list = await listPhotosInPhase(googleToken, selectedFolder.id, category, phase);
      setAlbumPhotos(list || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load photos from Google Drive.');
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
      const photoFileName = `${activeAlbumPhase.phase.replace(/[^a-zA-Z0-9_]/g, '_')}_Album_${Date.now()}.${file.name.split('.').pop()}`;
      await uploadPhotoToPhaseFolder(
        googleToken,
        selectedFolder.id,
        activeAlbumPhase.category,
        activeAlbumPhase.phase,
        photoFileName,
        file.type,
        file
      );
      await loadPhasePhotos(activeAlbumPhase.category, activeAlbumPhase.phase);
      setSuccess('Progress photo uploaded successfully!');
      setTimeout(() => setSuccess(null), 2500);
    } catch (err) {
      console.error(err);
      setError('Failed to upload progress photo.');
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
      // 1. Get or create X-Ray subfolder
      const xRayFolder = await findOrCreateFolder(googleToken, 'X-Ray Photos', selectedFolder.id);

      // 2. Search for blueprint_data.json inside X-Ray_Files subfolder
      const configJsonFile = await findFileInFolder(googleToken, xRayFolder, 'blueprint_data.json');
      
      if (configJsonFile) {
        setBlueprintDataFileId(configJsonFile.id);
        const data = await getFileContent(googleToken, configJsonFile.id);
        
        if (data.blueprintFileId) {
          setBlueprintFileId(data.blueprintFileId);
          setBlueprintFileName(data.blueprintFileName || 'Blueprint.png');
          setPins(data.pins || []);
          
          // 3. Fetch the blueprint image content as a private binary blob
          const imgUrl = `https://www.googleapis.com/drive/v3/files/${data.blueprintFileId}?alt=media`;
          const response = await fetch(imgUrl, {
            headers: { Authorization: `Bearer ${googleToken}` }
          });
          
          if (!response.ok) {
            throw new Error('Failed to download blueprint image.');
          }
          
          const blob = await response.blob();
          const localUrl = URL.createObjectURL(blob);
          setImageSrc(localUrl);
        } else {
          // JSON exists but no image linked
          setPins([]);
        }
      } else {
        // No data file found
        setBlueprintDataFileId(null);
        setBlueprintFileId(null);
        setPins([]);
      }
    } catch (err) {
      console.error(err);
      setError('Could not retrieve blueprint data from Google Drive.');
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
      // 1. Get or create X-Ray subfolder
      const xRayFolder = await findOrCreateFolder(googleToken, 'X-Ray Photos', selectedFolder.id);

      // 2. Upload blueprint image to X-Ray_Files subfolder
      const imgFileName = `${activeProject?.name || 'Project'}_Blueprint_${Date.now()}.${file.name.split('.').pop()}`;
      const imgUpload = await uploadFileToDrive(googleToken, xRayFolder, imgFileName, file.type, file);
      
      // 3. Create the configuration data payload
      const configPayload = {
        blueprintFileId: imgUpload.id,
        blueprintFileName: imgFileName,
        pins: []
      };

      const blob = new Blob([JSON.stringify(configPayload, null, 2)], { type: 'application/json' });
      
      // 4. Save blueprint_data.json to X-Ray_Files subfolder
      if (blueprintDataFileId) {
        await updateFileContent(googleToken, blueprintDataFileId, blob, 'application/json');
      } else {
        await uploadFileToDrive(googleToken, xRayFolder, 'blueprint_data.json', 'application/json', blob);
      }

      await loadBlueprintData();
      setSuccess('Blueprint uploaded successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setError('Failed to upload blueprint. Verify connection and permission settings.');
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
      let photoUrl = '';
      let photoFileId = '';

      // 1. If photo is selected, upload it to the proper folder inside Google Drive
      if (selectedPhoto) {
        const photoFileName = `${formData.tradePhase.replace(/[^a-zA-Z0-9_]/g, '_')}_Pin_${Date.now()}.${selectedPhoto.name.split('.').pop()}`;
        const uploadResult = await uploadPhotoToPhaseFolder(
          googleToken,
          selectedFolder.id, // Nest subcontractor photo folders inside root photos folder for consistency
          formData.tradeCategory,
          formData.tradePhase,
          photoFileName,
          selectedPhoto.type,
          selectedPhoto
        );
        photoFileId = uploadResult.id;
        photoUrl = uploadResult.webViewLink || '';
      }

      // 2. Build the new pin object
      const newPin = {
        id: `pin_${Date.now()}`,
        x: parseFloat(newPinCoords.x.toFixed(2)),
        y: parseFloat(newPinCoords.y.toFixed(2)),
        category: formData.tradeCategory,
        phase: formData.tradePhase,
        note: formData.note.trim(),
        photoFileId,
        photoUrl,
        createdAt: new Date().toISOString()
      };

      const updatedPins = [...pins, newPin];

      // 3. Serialize and save blueprint_data.json back to Google Drive
      const configPayload = {
        blueprintFileId,
        blueprintFileName,
        pins: updatedPins
      };

      const blob = new Blob([JSON.stringify(configPayload, null, 2)], { type: 'application/json' });
      await updateFileContent(googleToken, blueprintDataFileId, blob, 'application/json');

      setPins(updatedPins);
      setShowAddForm(false);
      setFormData({ tradeCategory: 'Mechanicals_&_Utilities', tradePhase: 'Plumbing Rough-In', note: '' });
      setSelectedPhoto(null);
      setPhotoPreview(null);
      setSuccess('Pin added to blueprint!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setError('Failed to save pin details. Please try again.');
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
      const updatedPins = pins.filter(p => p.id !== pinId);
      
      const configPayload = {
        blueprintFileId,
        blueprintFileName,
        pins: updatedPins
      };

      const blob = new Blob([JSON.stringify(configPayload, null, 2)], { type: 'application/json' });
      await updateFileContent(googleToken, blueprintDataFileId, blob, 'application/json');
      
      setPins(updatedPins);
      setSelectedPin(null);
      setSuccess('Pin removed.');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      console.error(err);
      setError('Failed to update pins data.');
    } finally {
      setLoading(false);
    }
  };

  // Reset blueprint image configuration
  const handleResetBlueprint = async () => {
    if (!window.confirm('WARNING: Removing the blueprint will unlink the image and delete all coordinate pins. Do you want to continue?')) return;
    
    setLoading(true);
    try {
      const configPayload = {
        blueprintFileId: null,
        blueprintFileName: null,
        pins: []
      };

      const blob = new Blob([JSON.stringify(configPayload, null, 2)], { type: 'application/json' });
      await updateFileContent(googleToken, blueprintDataFileId, blob, 'application/json');
      await loadBlueprintData();
    } catch {
      setError('Failed to clear blueprint.');
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
        /* Phase Albums View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
          
          {/* Albums Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-800)', padding: '12px 14px', borderRadius: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-zinc-400)', fontWeight: 600 }}>Photos & Progress Log</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>Browse progress photos by phase</span>
            </div>
            {!imageSrc && (
              <button 
                onClick={() => setViewMode('blueprint')}
                className="btn btn-primary"
                style={{ width: 'auto', padding: '6px 12px', fontSize: '0.75rem', height: '32px', border: 'none' }}
              >
                Link Floor Plan
              </button>
            )}
          </div>

          {activeAlbumPhase ? (
            /* Selected Phase Album Photos Stream */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', backgroundColor: 'var(--color-zinc-900)', border: '1px solid var(--color-zinc-800)', borderRadius: '12px', padding: '16px', flex: 1, overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-zinc-800)', paddingBottom: '10px' }}>
                <button
                  onClick={() => setActiveAlbumPhase(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', color: 'var(--color-zinc-400)', cursor: 'pointer', fontSize: '0.78rem', padding: 0 }}
                >
                  <ArrowLeft size={16} /> Back to Albums
                </button>
                <div style={{ textAlign: 'right' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>{activeAlbumPhase.phase}</h4>
                  <span style={{ fontSize: '0.62rem', color: 'var(--color-zinc-500)', textTransform: 'uppercase' }}>
                    {activeAlbumPhase.category.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              {/* Upload New Photo Button */}
              <div 
                onClick={() => !uploadingAlbumPhoto && albumFileInputRef.current?.click()}
                style={{
                  border: '1px dashed var(--color-zinc-700)',
                  borderRadius: '8px',
                  padding: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: uploadingAlbumPhoto ? 'not-allowed' : 'pointer',
                  backgroundColor: 'var(--color-zinc-950)',
                  opacity: uploadingAlbumPhoto ? 0.7 : 1
                }}
              >
                {uploadingAlbumPhoto ? (
                  <>
                    <Loader2 className="animate-spin" size={16} style={{ color: 'var(--color-amber-500)' }} />
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-zinc-400)' }}>Uploading to Drive...</span>
                  </>
                ) : (
                  <>
                    <Camera size={16} style={{ color: 'var(--color-amber-500)' }} />
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-zinc-300)', fontWeight: 600 }}>Snap / Upload Phase Photo</span>
                  </>
                )}
                <input
                  type="file"
                  ref={albumFileInputRef}
                  onChange={handleUploadAlbumPhoto}
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                />
              </div>

              {/* Photos Grid */}
              {loadingAlbumPhotos ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: '8px' }}>
                  <Loader2 className="animate-spin" size={24} style={{ color: 'var(--color-amber-500)' }} />
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-zinc-500)' }}>Fetching files...</span>
                </div>
              ) : albumPhotos.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-zinc-500)', fontSize: '0.78rem' }}>
                  <Image size={24} style={{ color: 'var(--color-zinc-700)', margin: '0 auto 8px' }} />
                  No photos logged for this phase yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {albumPhotos.map(photo => (
                    <div
                      key={photo.id}
                      onClick={() => setFullscreenAlbumPhoto(photo)}
                      style={{ position: 'relative', aspectRatio: '1', borderRadius: '6px', overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--color-zinc-800)', backgroundColor: 'var(--color-zinc-950)' }}
                    >
                      <img
                        src={photo.thumbnailLink}
                        alt={photo.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Categories & Phases Tree List */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
              {Object.keys(TRADE_SECTIONS_CONFIG).map(catKey => {
                const config = TRADE_SECTIONS_CONFIG[catKey];
                const isExpanded = expandedCategory === catKey;
                
                return (
                  <div key={catKey} style={{ border: '1px solid var(--color-zinc-800)', borderRadius: '10px', overflow: 'hidden', backgroundColor: 'var(--color-zinc-950)' }}>
                    <div
                      onClick={() => setExpandedCategory(isExpanded ? null : catKey)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', cursor: 'pointer', userSelect: 'none', backgroundColor: isExpanded ? 'var(--color-zinc-900)' : 'transparent' }}
                    >
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: config.color, textTransform: 'uppercase', letterSpacing: '0.01em' }}>
                        {config.label}
                      </span>
                      {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--color-zinc-500)' }} /> : <ChevronDown size={16} style={{ color: 'var(--color-zinc-500)' }} />}
                    </div>

                    {isExpanded && (
                      <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', backgroundColor: 'var(--color-zinc-900)' }}>
                        {config.phases.map(phase => (
                          <div
                            key={phase}
                            onClick={() => setActiveAlbumPhase({ category: catKey, phase })}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: '6px', backgroundColor: 'var(--color-zinc-950)', fontSize: '0.78rem', cursor: 'pointer', border: '1px solid var(--color-zinc-800)' }}
                          >
                            <span style={{ fontWeight: 600, color: 'var(--color-zinc-200)' }}>{phase}</span>
                            <Camera size={14} style={{ color: 'var(--color-zinc-500)' }} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : !imageSrc ? (
        /* Setup / Upload View */
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '40px 20px', border: '1px dashed var(--color-zinc-800)', borderRadius: '12px', backgroundColor: 'var(--color-zinc-900)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(197, 160, 89, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-amber-500)' }}>
            <Image size={24} style={{ margin: 'auto' }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '6px' }}>No Floor Plan Linked</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-zinc-400)', maxWidth: '280px', margin: '0 auto', lineHeight: 1.4 }}>
              Link your JPEG or PNG house blueprint. Drop pins on-site to log open-wall structural photos, HVAC duct layouts, and plumbing manifold runs.
            </p>
          </div>
          <button 
            onClick={() => blueprintInputRef.current?.click()}
            className="btn btn-primary"
            style={{ width: 'auto', padding: '10px 20px', fontSize: '0.85rem' }}
          >
            Select Blueprint Image
          </button>
          <input 
            type="file" 
            ref={blueprintInputRef} 
            onChange={handleUploadBlueprint} 
            accept="image/*" 
            style={{ display: 'none' }} 
          />
        </div>
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
                style={{ width: '28px', height: '28px', backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-800)', borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', justifyCenter: 'center', cursor: 'pointer' }}
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
          {selectedPin && (
            <div style={{ backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-800)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', animation: 'slideUp 0.2s ease-out' }}>
              <div style={{ display: 'flex', justifyContext: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: TRADE_SECTIONS_CONFIG[selectedPin.category]?.color || '#fff', fontWeight: 800, letterSpacing: '0.05em' }}>
                    {TRADE_SECTIONS_CONFIG[selectedPin.category]?.label || 'General'}
                  </span>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>{selectedPin.phase}</h4>
                </div>
                <button 
                  onClick={() => setSelectedPin(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-zinc-500)', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Note details */}
              <p style={{ fontSize: '0.8rem', color: 'var(--color-zinc-300)', lineHeight: 1.4, backgroundColor: 'var(--color-zinc-900)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-zinc-800)' }}>
                {selectedPin.note}
              </p>

              {/* Photo preview link */}
              {selectedPin.photoUrl && (
                <div style={{ position: 'relative', width: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-zinc-800)' }}>
                  <a href={selectedPin.photoUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
                    <div style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.65rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Eye size={10} /> Open in Drive
                    </div>
                    <img 
                      src={`https://www.googleapis.com/drive/v3/files/${selectedPin.photoFileId}?alt=media`}
                      alt="Verification preview"
                      style={{ width: '100%', maxHeight: '180px', objectFit: 'cover' }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                    <div style={{ backgroundColor: 'var(--color-zinc-900)', padding: '8px', textAlign: 'center', fontSize: '0.74rem', color: 'var(--color-amber-500)', fontWeight: 600 }}>
                      📷 Click to View Verification Photo
                    </div>
                  </a>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button
                  onClick={() => handleDeletePin(selectedPin.id)}
                  className="btn"
                  style={{ backgroundColor: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.2)', color: 'var(--color-rose-500)', fontSize: '0.75rem', padding: '6px 12px', fontWeight: 600 }}
                >
                  Delete Pin
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Pin Modal Form */}
      {showAddForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' }}>
          <div style={{ backgroundColor: 'var(--color-zinc-900)', border: '1px solid var(--color-zinc-800)', borderRadius: '16px', padding: '20px', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '16px', margin: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>Add Installation Pin</h3>
              <button 
                onClick={() => setShowAddForm(false)}
                style={{ background: 'none', border: 'none', color: 'var(--color-zinc-500)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Trade Category */}
              <div>
                <label className="form-label" style={{ fontSize: '0.72rem' }}>Subcontractor Category</label>
                <select
                  value={formData.tradeCategory}
                  onChange={handleCategoryChange}
                  className="form-input"
                  style={{ width: '100%', height: '36px', borderRadius: '8px', padding: '0 10px', fontSize: '0.82rem', backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-800)', color: '#fff' }}
                >
                  {Object.keys(TRADE_SECTIONS_CONFIG).map(catKey => (
                    <option key={catKey} value={catKey}>
                      {TRADE_SECTIONS_CONFIG[catKey].label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Trade Phase */}
              <div>
                <label className="form-label" style={{ fontSize: '0.72rem' }}>Project Phase Block</label>
                <select
                  value={formData.tradePhase}
                  onChange={(e) => setFormData(prev => ({ ...prev, tradePhase: e.target.value }))}
                  className="form-input"
                  style={{ width: '100%', height: '36px', borderRadius: '8px', padding: '0 10px', fontSize: '0.82rem', backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-800)', color: '#fff' }}
                >
                  {TRADE_SECTIONS_CONFIG[formData.tradeCategory]?.phases.map(ph => (
                    <option key={ph} value={ph}>{ph}</option>
                  ))}
                </select>
              </div>

              {/* Description Note */}
              <div>
                <label className="form-label" style={{ fontSize: '0.72rem' }}>Installation Note</label>
                <textarea
                  value={formData.note}
                  onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
                  placeholder="e.g. Master shower hot/cold manifold routing detail..."
                  className="form-input"
                  rows={3}
                  style={{ width: '100%', borderRadius: '8px', padding: '8px 10px', fontSize: '0.82rem', backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-800)', color: '#fff', resize: 'none' }}
                />
              </div>

              {/* Camera Photo Upload */}
              <div>
                <label className="form-label" style={{ fontSize: '0.72rem' }}>Verification Photo (Optional)</label>
                
                {photoPreview ? (
                  <div style={{ position: 'relative', width: '100%', height: '140px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-zinc-800)' }}>
                    <img src={photoPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPhoto(null);
                        setPhotoPreview(null);
                      }}
                      style={{ position: 'absolute', top: '8px', right: '8px', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyCenter: 'center', cursor: 'pointer' }}
                    >
                      <X size={12} style={{ margin: 'auto' }} />
                    </button>
                  </div>
                ) : (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    style={{ border: '1px dashed var(--color-zinc-700)', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', backgroundColor: 'var(--color-zinc-950)' }}
                  >
                    <Camera size={16} style={{ color: 'var(--color-zinc-400)' }} />
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-zinc-400)' }}>Take Photo / Upload Image</span>
                  </div>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoSelect}
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="btn"
                  style={{ backgroundColor: 'var(--color-zinc-800)', border: 'none', color: '#fff', fontSize: '0.8rem', height: '36px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPin}
                  className="btn btn-primary"
                  style={{ flex: 1, border: 'none', fontSize: '0.8rem', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  {savingPin ? (
                    <>
                      <Loader2 className="animate-spin" size={14} />
                      Saving...
                    </>
                  ) : (
                    'Save Pin'
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Fullscreen Album Photo Modal */}
      {fullscreenAlbumPhoto && (
        <div 
          onClick={() => setFullscreenAlbumPhoto(null)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '20px' }}
        >
          <button 
            onClick={() => setFullscreenAlbumPhoto(null)}
            style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
          >
            <X size={24} />
          </button>
          
          <img 
            src={`https://www.googleapis.com/drive/v3/files/${fullscreenAlbumPhoto.id}?alt=media`}
            alt={fullscreenAlbumPhoto.name}
            style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px', border: '1px solid var(--color-zinc-800)' }}
            onClick={(e) => e.stopPropagation()}
          />
          
          <div style={{ marginTop: '16px', textAlign: 'center', color: '#fff', fontSize: '0.82rem' }}>
            <p style={{ fontWeight: 600 }}>{fullscreenAlbumPhoto.name}</p>
            <a 
              href={fullscreenAlbumPhoto.webViewLink} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: 'var(--color-amber-500)', textDecoration: 'none', fontSize: '0.74rem', marginTop: '6px', display: 'inline-block', fontWeight: 600 }}
              onClick={(e) => e.stopPropagation()}
            >
              Open in Google Drive ↗
            </a>
          </div>
        </div>
      )}

    </div>
  );
}
