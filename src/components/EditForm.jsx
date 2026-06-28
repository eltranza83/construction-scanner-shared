import React, { useState, useRef, useEffect } from 'react';
import { Camera, ArrowLeft, Save, Plus, Trash2, Calendar, User, DollarSign, Tag, CheckSquare, MapPin } from 'lucide-react';

/**
 * Resizes and compresses an image client-side in a memory-efficient manner.
 */
function compressImage(file, maxWidth = 1200, maxHeight = 1200) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (blob) {
          const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_compressed.jpg", {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(compressedFile);
        } else {
          resolve(file);
        }
      }, 'image/jpeg', 0.8);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

const TRADE_SECTIONS_CONFIG = {
  'Site_Prep_&_Structure': {
    label: 'Site Prep & Structure',
    phases: ['Foundation & Flatwork', 'Roofing', 'Windows & Exterior Doors']
  },
  'Framing_&_Lumber': {
    label: 'Framing & Lumber',
    phases: ['Framing & Lumber']
  },
  'Mechanicals_&_Utilities': {
    label: 'Mechanicals & Utilities',
    phases: ['Plumbing Rough-In', 'Electrical & Lighting', 'HVAC / AC Systems', 'Insulation & Alarms']
  },
  'Interior_Finishes': {
    label: 'Interior Finishes',
    phases: ['Drywall & Sheetrock', 'Cabinets & Trim Carpentry', 'Quartz & Countertops', 'Glass Work']
  },
  'Paint_Tile': {
    label: 'Paint & Tile',
    phases: ['Tile & Flooring', 'Paint & Finishes']
  },
  'House_Exterior_&_Yard': {
    label: 'House Exterior & Yard',
    phases: ['Stucco & Masonry', 'Garage Doors', 'Driveway & Sidewalks', 'Cantera Stone Detail', 'Fencing & Gates', 'Landscaping & Irrigation']
  },
  'Project_Overhead_&_Bills': {
    label: 'Project Overhead & Bills',
    phases: ['Monthly Utility Bills', 'Dumpsters & Cleaning', 'Extra Costs & Misc']
  }
};

const ALLOCATION_COLORS = [
  { text: '#C5A059', border: '#C5A059', bg: 'rgba(197, 160, 89, 0.12)', darkBg: 'rgba(197, 160, 89, 0.04)' }, // Gold
  { text: '#38bdf8', border: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', darkBg: 'rgba(56, 189, 248, 0.04)' }, // Blue
  { text: '#34d399', border: '#34d399', bg: 'rgba(52, 211, 153, 0.12)', darkBg: 'rgba(52, 211, 153, 0.04)' }, // Green
  { text: '#c084fc', border: '#c084fc', bg: 'rgba(192, 132, 252, 0.12)', darkBg: 'rgba(192, 132, 252, 0.04)' }  // Purple
];

// Helper to suggest the best split ID for a given line item description based on keywords
function suggestSplitId(description, splits) {
  if (!description || !splits || splits.length === 0) return null;
  const desc = description.toLowerCase();
  
  const keywords = {
    plumbing: ['pvc', 'elbow', 'valve', 'pipe', 'drain', 'shower', 'solder', 'copper', 'faucet', 'sink', 'toilet', 'brass', 'tee', 'flange', 'abs', 'cpvc', 'nipple', 'plumb', 'hose', 'washer', 'coupling', 'tub', 'cleanout'],
    electrical: ['wire', 'box', 'switch', 'outlet', 'breaker', 'conduit', 'gang', 'romex', 'cable', 'lamp', 'bulb', 'light', 'electric', 'receptacle', 'connector', 'dimmer', 'ground', 'fuse', 'tape', 'pigtail', 'fixture', 'junction'],
    hvac: ['duct', 'register', 'vent', 'grille', 'thermostat', 'ac', 'furnace', 'hvac', 'damper', 'flex', 'insulation', 'compressor', 'fan', 'filter', 'baffle'],
    framing: ['lumber', 'stud', 'plywood', 'nail', 'bolt', 'truss', 'header', 'joist', 'timber', 'post', 'screw', 'anchor', 'wood', 'hanger', 'plate', 'frame', 'sheathing', 'tie']
  };

  const isPlumbingItem = keywords.plumbing.some(k => desc.includes(k));
  const isElectricalItem = keywords.electrical.some(k => desc.includes(k));
  const isHVACItem = keywords.hvac.some(k => desc.includes(k));
  const isFramingItem = keywords.framing.some(k => desc.includes(k));

  // Find a split that matches the category of the item
  for (const s of splits) {
    const phaseLower = (s.tradePhase || '').toLowerCase();
    const catLower = (s.tradeCategory || '').toLowerCase();

    if (isPlumbingItem && (phaseLower.includes('plumb') || phaseLower.includes('sewer') || phaseLower.includes('water') || catLower.includes('plumb'))) {
      return s.id;
    }
    if (isElectricalItem && (phaseLower.includes('elect') || phaseLower.includes('light') || phaseLower.includes('power') || phaseLower.includes('wire') || catLower.includes('elect'))) {
      return s.id;
    }
    if (isHVACItem && (phaseLower.includes('hvac') || phaseLower.includes('duct') || phaseLower.includes('heat') || phaseLower.includes('vent') || phaseLower.includes('air'))) {
      return s.id;
    }
    if (isFramingItem && (phaseLower.includes('frame') || phaseLower.includes('lumber') || phaseLower.includes('wood') || phaseLower.includes('truss') || catLower.includes('frame') || catLower.includes('struct'))) {
      return s.id;
    }
  }

  return null;
}

export default function EditForm({ stagedItem, onSave, onCancel, history = [], stagedItems = [], projects = [] }) {
  // Fallback mock items for existing user drafts
  if (!stagedItem.metadata.lineItems && stagedItem.metadata.vendor?.toLowerCase().includes('home depot')) {
    const totalAmt = parseFloat(stagedItem.metadata.amount);
    if (Math.abs(totalAmt - 206.92) < 0.05) {
      stagedItem.metadata.lineItems = [
        { description: 'PVC elbow & rough-in shower valve', price: 156.60 },
        { description: 'wire box & light switches pack', price: 50.32 }
      ];
    }
  }

  const [formData, setFormData] = useState({
    type: stagedItem.metadata.type || 'invoice',
    description: stagedItem.metadata.description || '',
    lotNumber: stagedItem.metadata.lotNumber || '',
    vendor: stagedItem.metadata.vendor || '',
    costCategory: stagedItem.metadata.costCategory || 'material',
    amount: stagedItem.metadata.amount || '',
    date: stagedItem.metadata.date || '',
    checkNumber: stagedItem.metadata.checkNumber || '',
    tradeCategory: stagedItem.metadata.tradeCategory || 'Mechanicals_&_Utilities',
    tradePhase: stagedItem.metadata.tradePhase || 'Plumbing Rough-In',
  });

  const handleCategoryChange = (e) => {
    const newCat = e.target.value;
    const defaultPhase = TRADE_SECTIONS_CONFIG[newCat]?.phases[0] || '';
    setFormData(prev => ({
      ...prev,
      tradeCategory: newCat,
      tradePhase: defaultPhase
    }));
  };

  const [mainImageBase64, setMainImageBase64] = useState(stagedItem.mainImageBase64 || null);
  const [secondaryImageBase64, setSecondaryImageBase64] = useState(stagedItem.secondaryImageBase64 || null);

  // Duplicate Warning State
  const [duplicateWarning, setDuplicateWarning] = useState(null);

  // Splits state
  const [isSplit, setIsSplit] = useState(stagedItem.metadata.splits && stagedItem.metadata.splits.length > 0);
  const [splits, setSplits] = useState(() => {
    if (stagedItem.metadata.splits && stagedItem.metadata.splits.length > 0) {
      return stagedItem.metadata.splits.map((s, idx) => ({
        id: s.id || `split_loaded_${idx}_${Date.now()}`,
        amount: s.amount || '',
        costCategory: s.costCategory || 'material',
        lotNumber: s.lotNumber || '',
        description: s.description || '',
        tradeCategory: s.tradeCategory || 'Mechanicals_&_Utilities',
        tradePhase: s.tradePhase || 'Plumbing Rough-In'
      }));
    }
    return [
      { 
        id: 'split_1', 
        amount: stagedItem.metadata.amount || '', 
        costCategory: stagedItem.metadata.costCategory || 'material', 
        lotNumber: stagedItem.metadata.lotNumber || '', 
        description: stagedItem.metadata.description || '',
        tradeCategory: stagedItem.metadata.tradeCategory || 'Mechanicals_&_Utilities',
        tradePhase: stagedItem.metadata.tradePhase || 'Plumbing Rough-In'
      }
    ];
  });

  // itemAllocations maps: itemIndex -> split.id
  const [itemAllocations, setItemAllocations] = useState({});
  // Track manual allocations by the user so suggestions don't override them
  const [manualAllocations, setManualAllocations] = useState({});
  // Track manual split descriptions so auto-generator doesn't override them
  const [manualDescriptions, setManualDescriptions] = useState({});

  useEffect(() => {
    if (stagedItem.metadata.lineItems && splits.length > 0) {
      setItemAllocations(prev => {
        const next = { ...prev };
        stagedItem.metadata.lineItems.forEach((item, idx) => {
          // Only auto-suggest if user hasn't manually assigned this item
          if (!manualAllocations[idx]) {
            const suggestedId = suggestSplitId(item.description, splits);
            if (suggestedId) {
              next[idx] = suggestedId;
            } else {
              // Default fallback
              if (idx === 0) {
                next[idx] = splits[0].id;
              } else {
                next[idx] = splits[1] ? splits[1].id : splits[0].id;
              }
            }
          }
        });
        return next;
      });
    }
  }, [splits, stagedItem.metadata.lineItems, manualAllocations]);

  // Run initial allocation calculation if itemAllocations is populated
  useEffect(() => {
    if (stagedItem.metadata.lineItems && splits.length > 0 && Object.keys(itemAllocations).length > 0) {
      // Calculate sums and descriptions based on current allocations
      setSplits(currentSplits => {
        let changed = false;
        const updated = currentSplits.map(s => {
          const itemsForThisSplit = (stagedItem.metadata.lineItems || []).filter((_, idx) => itemAllocations[idx] === s.id);
          const sum = itemsForThisSplit.reduce((acc, item) => acc + (parseFloat(item.price) || 0), 0);
          const amtStr = sum > 0 ? sum.toFixed(2) : '';
          
          let descStr = s.description;
          if (!manualDescriptions[s.id]) {
            descStr = itemsForThisSplit.map(item => item.description).join(', ');
          }

          if (s.amount !== amtStr || s.description !== descStr) {
            changed = true;
          }
          return {
            ...s,
            amount: amtStr,
            description: descStr
          };
        });
        
        if (changed) {
          const totalSum = updated.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);
          setFormData(f => ({ ...f, amount: totalSum || '' }));
          return updated;
        }
        return currentSplits;
      });
    }
  }, [itemAllocations, stagedItem.metadata.lineItems, manualDescriptions]);

  const handleAllocateItem = (itemIdx, splitId) => {
    setManualAllocations(prev => ({ ...prev, [itemIdx]: true }));
    setItemAllocations(prev => {
      const next = { ...prev, [itemIdx]: splitId };
      
      setSplits(currentSplits => {
        const updated = currentSplits.map(s => {
          const itemsForThisSplit = (stagedItem.metadata.lineItems || []).filter((_, idx) => next[idx] === s.id);
          const sum = itemsForThisSplit.reduce((acc, item) => acc + (parseFloat(item.price) || 0), 0);
          
          let descStr = s.description;
          if (!manualDescriptions[s.id]) {
            descStr = itemsForThisSplit.map(item => item.description).join(', ');
          }

          return {
            ...s,
            amount: sum > 0 ? sum.toFixed(2) : '',
            description: descStr
          };
        });
        
        const totalSum = updated.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);
        setFormData(f => ({ ...f, amount: totalSum || '' }));
        
        return updated;
      });
      
      return next;
    });
  };

  // Run real-time duplicate check
  useEffect(() => {
    const amountVal = parseFloat(formData.amount);
    const vendorVal = formData.vendor.trim().toLowerCase();
    const dateVal = formData.date.trim();

    if (!amountVal || !vendorVal || !dateVal) {
      setDuplicateWarning(null);
      return;
    }

    // Check history
    const matchHistory = history.find(h => 
      parseFloat(h.amount) === amountVal &&
      h.vendor?.toLowerCase().trim() === vendorVal &&
      h.dateTransaction === dateVal
    );

    // Check other staged drafts (excluding this one)
    const matchDrafts = stagedItems.find(d => 
      d.id !== stagedItem.id &&
      parseFloat(d.metadata?.amount) === amountVal &&
      d.metadata?.vendor?.toLowerCase().trim() === vendorVal &&
      d.metadata?.date === dateVal
    );

    if (matchHistory) {
      setDuplicateWarning(`Already logged on ${matchHistory.dateLogged} (available in History).`);
    } else if (matchDrafts) {
      setDuplicateWarning(`Matches another staged draft in your list.`);
    } else {
      setDuplicateWarning(null);
    }
  }, [formData.amount, formData.vendor, formData.date, history, stagedItems, stagedItem.id]);

  const mainImageUrl = mainImageBase64;
  const secondaryImageUrl = secondaryImageBase64;

  // Splits handlers
  const handleAddSplit = () => {
    setSplits(prev => [
      ...prev,
      { 
        id: `split_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, 
        amount: '', 
        costCategory: 'material', 
        lotNumber: formData.lotNumber || '', 
        description: '',
        tradeCategory: formData.tradeCategory || 'Mechanicals_&_Utilities',
        tradePhase: formData.tradePhase || 'Plumbing Rough-In'
      }
    ]);
  };

  const handleRemoveSplit = (id) => {
    if (splits.length <= 1) return;
    setSplits(prev => prev.filter(s => s.id !== id));
  };

  const handleSplitChange = (id, field, value) => {
    if (field === 'description') {
      setManualDescriptions(prev => ({ ...prev, [id]: true }));
    }
    setSplits(prev => prev.map(s => {
      if (s.id === id) {
        const updated = { ...s, [field]: value };
        // If updating split amounts, keep main formData.amount updated as the sum in real-time
        if (field === 'amount') {
          setTimeout(() => {
            setSplits(currentSplits => {
              const sum = currentSplits.reduce((acc, sp) => acc + (parseFloat(sp.amount) || 0), 0);
              setFormData(f => ({ ...f, amount: sum || '' }));
              return currentSplits;
            });
          }, 10);
        }
        return updated;
      }
      return s;
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleToggleCategory = (category) => {
    setFormData(prev => ({
      ...prev,
      costCategory: category
    }));
  };

  const handleToggleDocType = (type) => {
    setFormData(prev => ({
      ...prev,
      type: type,
      checkNumber: type === 'check' ? prev.checkNumber : null
    }));
  };

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const compressedFile = await compressImage(files[0]);
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(compressedFile);
      });
      setSecondaryImageBase64(base64);
    }
  };

  const handleRemoveReceipt = () => {
    setSecondaryImageBase64(null);
  };

  // WebRTC camera states for receipt attachments
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const videoRef = useRef(null);
  const [cameraError, setCameraError] = useState(null);

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      setCameraStream(stream);
      setShowCamera(true);
      
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error('Failed to access camera:', err);
      setCameraError('Could not start inline camera. Please verify permissions.');
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(async (blob) => {
        if (blob) {
          const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
          stopCamera();
          const compressed = await compressImage(file);
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(compressed);
          });
          setSecondaryImageBase64(base64);
        } else {
          setCameraError('Failed to capture canvas frame.');
        }
      }, 'image/jpeg', 0.85);
      
    } catch (err) {
      console.error('Capture failed:', err);
      setCameraError(`Capture failed: ${err.message}`);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    let finalAmount = parseFloat(formData.amount) || 0;
    let finalSplits = null;
    
    if (isSplit) {
      finalAmount = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
      finalSplits = splits.map(s => ({
        id: s.id || `split_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        amount: parseFloat(s.amount) || 0,
        costCategory: s.costCategory,
        lotNumber: s.lotNumber.trim(),
        description: s.description.trim(),
        tradeCategory: s.tradeCategory || formData.tradeCategory,
        tradePhase: s.tradePhase || formData.tradePhase
      }));
    }

    onSave({
      metadata: {
        ...formData,
        amount: finalAmount,
        splits: finalSplits
      },
      mainImageBase64,
      secondaryImageBase64
    });
  };

  if (showCamera) {
    return (
      <div className="edit-overlay-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Inline Camera</h2>
          <button 
            type="button" 
            onClick={stopCamera} 
            className="btn btn-secondary" 
            style={{ width: 'auto', padding: '6px 12px', fontSize: '0.8rem' }}
          >
            Cancel
          </button>
        </div>

        <div className="camera-container">
          <video 
            ref={videoRef} 
            className="camera-video" 
            autoPlay 
            playsInline
            muted
          />
          <div className="camera-overlay">
            <div className="camera-target-box"></div>
          </div>
        </div>

        <div className="camera-controls">
          <button 
            type="button" 
            onClick={capturePhoto} 
            className="shutter-btn"
            title="Capture photo"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="edit-overlay-container" style={{ gap: '12px' }}>
      <div className="edit-header" style={{ paddingBottom: '8px', marginBottom: '4px' }}>
        <button onClick={onCancel} className="nav-item" style={{ width: 'auto', padding: '4px', flex: 'none' }} type="button">
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>Review & Edit Scan</span>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        
        {/* Real-Time Duplicate Warning */}
        {duplicateWarning && (
          <div style={{
            backgroundColor: 'rgba(245, 158, 11, 0.04)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderLeft: '4px solid var(--color-amber-500)',
            borderRadius: '8px',
            padding: '10px 12px',
            color: 'var(--color-zinc-100)',
            fontSize: '0.8rem',
            lineHeight: '1.4',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            marginBottom: '4px'
          }}>
            <span style={{ fontSize: '1.1rem', marginTop: '-2px', color: 'var(--color-amber-500)' }}>⚠️</span>
            <div>
              <strong style={{ color: 'var(--color-amber-400)' }}>Potential Duplicate Scan:</strong> {duplicateWarning}
            </div>
          </div>
        )}
        
        {/* Row 1: Document Type & Cost Classification */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.72rem' }}>Doc Type</label>
            <div className="cost-toggle-container">
              <button 
                type="button" 
                className={`cost-toggle-btn ${formData.type !== 'check' ? 'active material' : ''}`}
                style={{ padding: '8px 4px', fontSize: '0.75rem' }}
                onClick={() => handleToggleDocType('invoice')}
              >
                Invoice / Receipt
              </button>
              <button 
                type="button" 
                className={`cost-toggle-btn ${formData.type === 'check' ? 'active labor' : ''}`}
                style={{ padding: '8px 4px', fontSize: '0.75rem' }}
                onClick={() => handleToggleDocType('check')}
              >
                Check
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '0.72rem' }}>Classification</label>
            {isSplit ? (
              <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--color-amber-400)', fontWeight: 700, backgroundColor: 'var(--color-zinc-900)', borderRadius: '6px', border: '1px solid var(--color-zinc-800)', textAlign: 'center', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
                Multiple (Split)
              </div>
            ) : (
              <div className="cost-toggle-container">
                <button 
                  type="button" 
                  className={`cost-toggle-btn ${formData.costCategory === 'material' ? 'active material' : ''}`}
                  style={{ padding: '8px 4px', fontSize: '0.75rem' }}
                  onClick={() => handleToggleCategory('material')}
                >
                  Material
                </button>
                <button 
                  type="button" 
                  className={`cost-toggle-btn ${formData.costCategory === 'labor' ? 'active labor' : ''}`}
                  style={{ padding: '8px 4px', fontSize: '0.75rem' }}
                  onClick={() => handleToggleCategory('labor')}
                >
                  Labor
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Description & Lot Number */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="edit-description" style={{ fontSize: '0.72rem' }}>
              <Tag size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              Description
            </label>
            <input 
              type="text"
              id="edit-description"
              name="description"
              required
              className="form-input"
              style={{ padding: '8px 12px', fontSize: '0.85rem', width: '100%' }}
              value={formData.description}
              onChange={handleChange}
              placeholder="Rough plumbing, lumber..."
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="edit-lot-number" style={{ fontSize: '0.72rem' }}>
              <MapPin size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              Lot / Address
            </label>
            <select
              id="edit-lot-number"
              name="lotNumber"
              className="form-input"
              style={{ padding: '8px 12px', fontSize: '0.85rem' }}
              value={formData.lotNumber || ''}
              onChange={handleChange}
            >
              <option value="">Select Lot</option>
              {projects.map(p => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Trade Section & Phase AI Classification */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="edit-trade-category" style={{ fontSize: '0.72rem' }}>
              Subcontractor Category
            </label>
            <select
              id="edit-trade-category"
              name="tradeCategory"
              className="form-input"
              style={{ padding: '8px 12px', fontSize: '0.85rem' }}
              value={formData.tradeCategory || 'Mechanicals_&_Utilities'}
              onChange={handleCategoryChange}
            >
              {Object.keys(TRADE_SECTIONS_CONFIG).map(catKey => (
                <option key={catKey} value={catKey}>
                  {TRADE_SECTIONS_CONFIG[catKey].label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="edit-trade-phase" style={{ fontSize: '0.72rem' }}>
              Project Phase Block
            </label>
            <select
              id="edit-trade-phase"
              name="tradePhase"
              className="form-input"
              style={{ padding: '8px 12px', fontSize: '0.85rem' }}
              value={formData.tradePhase || ''}
              onChange={handleChange}
            >
              {(TRADE_SECTIONS_CONFIG[formData.tradeCategory || 'Mechanicals_&_Utilities']?.phases || []).map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 3: Vendor, Amount, Date & Check Number dynamically sized */}
        {formData.type === 'check' ? (
          <>
            {/* For Check Type: Two rows of two columns */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-vendor" style={{ fontSize: '0.72rem' }}>
                  <User size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  Contact / Vendor
                </label>
                <input 
                  type="text"
                  id="edit-vendor"
                  name="vendor"
                  required
                  className="form-input"
                  style={{ padding: '8px 12px', fontSize: '0.85rem', width: '100%' }}
                  value={formData.vendor}
                  onChange={handleChange}
                  placeholder="Lowe's, vendor name..."
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-amount" style={{ fontSize: '0.72rem' }}>
                  <DollarSign size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  {isSplit ? 'Total Amount (Split)' : 'Amount ($)'}
                </label>
                {isSplit ? (
                  <input 
                    type="text"
                    id="edit-amount"
                    disabled
                    className="form-input"
                    style={{ padding: '8px 12px', fontSize: '0.85rem', width: '100%', backgroundColor: 'var(--color-zinc-900)', color: 'var(--color-amber-400)', fontWeight: 700, border: '1px dashed var(--color-zinc-700)', boxSizing: 'border-box' }}
                    value={`$${(splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)).toFixed(2)}`}
                  />
                ) : (
                  <input 
                    type="number"
                    step="0.01"
                    id="edit-amount"
                    name="amount"
                    required
                    className="form-input"
                    style={{ padding: '8px 12px', fontSize: '0.85rem', width: '100%' }}
                    value={formData.amount}
                    onChange={handleChange}
                    placeholder="0.00"
                  />
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-date" style={{ fontSize: '0.72rem' }}>
                  <Calendar size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  Transaction Date
                </label>
                <input 
                  type="date"
                  id="edit-date"
                  name="date"
                  required
                  className="form-input"
                  style={{ padding: '8px 12px', fontSize: '0.85rem', width: '100%' }}
                  value={formData.date}
                  onChange={handleChange}
                  onClick={(e) => { try { e.target.showPicker(); } catch (err) {} }}
                  onFocus={(e) => { try { e.target.showPicker(); } catch (err) {} }}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-check-number" style={{ fontSize: '0.72rem' }}>
                  <CheckSquare size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  Check Number
                </label>
                <input 
                  type="text"
                  id="edit-check-number"
                  name="checkNumber"
                  required
                  className="form-input"
                  style={{ padding: '8px 12px', fontSize: '0.85rem', width: '100%' }}
                  value={formData.checkNumber || ''}
                  onChange={handleChange}
                  placeholder="Check #"
                />
              </div>
            </div>
          </>
        ) : (
          /* For Invoice / Receipt Type: Single row of three columns */
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="edit-vendor" style={{ fontSize: '0.72rem' }}>
                <User size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                Contact / Vendor
              </label>
              <input 
                type="text"
                id="edit-vendor"
                name="vendor"
                required
                className="form-input"
                style={{ padding: '8px 12px', fontSize: '0.85rem', width: '100%' }}
                value={formData.vendor}
                onChange={handleChange}
                placeholder="Vendor name..."
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="edit-amount" style={{ fontSize: '0.72rem' }}>
                <DollarSign size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                {isSplit ? 'Amount' : 'Amount ($)'}
              </label>
              {isSplit ? (
                <input 
                  type="text"
                  id="edit-amount"
                  disabled
                  className="form-input"
                  style={{ padding: '8px 12px', fontSize: '0.85rem', width: '100%', backgroundColor: 'var(--color-zinc-900)', color: 'var(--color-amber-400)', fontWeight: 700, border: '1px dashed var(--color-zinc-700)', boxSizing: 'border-box' }}
                  value={`$${(splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)).toFixed(2)}`}
                />
              ) : (
                <input 
                  type="number"
                  step="0.01"
                  id="edit-amount"
                  name="amount"
                  required
                  className="form-input"
                  style={{ padding: '8px 12px', fontSize: '0.85rem', width: '100%' }}
                  value={formData.amount}
                  onChange={handleChange}
                  placeholder="0.00"
                />
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="edit-date" style={{ fontSize: '0.72rem' }}>
                <Calendar size={10} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                Transaction Date
              </label>
              <input 
                type="date"
                id="edit-date"
                name="date"
                required
                className="form-input"
                style={{ padding: '8px 12px', fontSize: '0.85rem', width: '100%' }}
                value={formData.date}
                onChange={handleChange}
                onClick={(e) => { try { e.target.showPicker(); } catch (err) {} }}
                onFocus={(e) => { try { e.target.showPicker(); } catch (err) {} }}
              />
            </div>
          </div>
        )}

        {/* Split Expense Configuration Block */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '8px', 
          border: '1px solid var(--color-zinc-800)', 
          borderLeft: isSplit ? '3px solid #C5A059' : '3px solid var(--color-zinc-700)', /* Highlight left border */
          padding: '10px 12px', 
          borderRadius: '8px', 
          backgroundColor: 'var(--color-zinc-900)',
          transition: 'border-left-color 0.25s ease'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-zinc-200)' }}>Split Expense Allocations</span>
              <span style={{ fontSize: '0.68rem', color: 'var(--color-zinc-500)' }}>Allot costs to different lots or classifications</span>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextSplit = !isSplit;
                setIsSplit(nextSplit);
                if (nextSplit) {
                  setManualAllocations({});
                  setItemAllocations({});
                  setManualDescriptions({});
                  const activeName = formData.lotNumber || '';
                  let otherName = '';
                  if (projects && projects.length === 2) {
                    const otherProj = projects.find(p => p.name !== activeName);
                    if (otherProj) {
                      otherName = otherProj.name;
                    }
                  }
                  
                  setSplits([
                    {
                      id: 'split_init_1',
                      amount: '',
                      costCategory: formData.costCategory || 'material',
                      lotNumber: activeName,
                      description: '',
                      tradeCategory: formData.tradeCategory || 'Mechanicals_&_Utilities',
                      tradePhase: formData.tradePhase || 'Plumbing Rough-In'
                    },
                    {
                      id: 'split_init_2',
                      amount: '',
                      costCategory: formData.costCategory || 'material',
                      lotNumber: otherName,
                      description: '',
                      tradeCategory: formData.tradeCategory || 'Mechanicals_&_Utilities',
                      tradePhase: formData.tradePhase || 'Plumbing Rough-In'
                    }
                  ]);
                }
              }}
              style={{
                width: 'auto',
                padding: '6px 12px',
                fontSize: '0.72rem',
                fontWeight: 700,
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
                backgroundColor: isSplit ? '#C5A059' : 'rgba(197, 160, 89, 0.08)',
                color: isSplit ? '#000000' : '#C5A059',
                border: isSplit ? '1px solid #C5A059' : '1px solid rgba(197, 160, 89, 0.4)',
                boxShadow: isSplit ? '0 2px 8px rgba(197, 160, 89, 0.25)' : 'none',
              }}
            >
              {isSplit ? 'Split Active' : 'Enable Split'}
            </button>
          </div>

          {isSplit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px', borderTop: '1px solid var(--color-zinc-800)', paddingTop: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#C5A059' }}>Splits List</span>
                <button 
                  type="button"
                  onClick={handleAddSplit}
                  className="btn btn-secondary"
                  style={{ width: 'auto', padding: '3px 8px', fontSize: '0.68rem', borderColor: '#C5A059', color: '#C5A059' }}
                >
                  + Add Split Row
                </button>
              </div>

              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '12px', 
                maxHeight: splits.length > 2 ? '320px' : 'none', 
                overflowY: splits.length > 2 ? 'auto' : 'visible', 
                paddingRight: '4px' 
              }}>
                {splits.map((split, index) => {
                  const colorTheme = ALLOCATION_COLORS[index % ALLOCATION_COLORS.length];
                  return (
                    <div key={split.id} style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '6px', 
                      backgroundColor: 'var(--color-zinc-950)', 
                      border: '1px solid var(--color-zinc-800)', 
                      borderLeft: `3px solid ${colorTheme.border}`,
                      padding: '8px', 
                      borderRadius: '6px' 
                    }}>
                      {/* Split Card Header with Allocation Number & Delete button */}
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        borderBottom: '1px dashed var(--color-zinc-800)', 
                        paddingBottom: '6px', 
                        marginBottom: '2px' 
                      }}>
                        <span style={{ 
                          fontSize: '0.65rem', 
                          fontWeight: 800, 
                          color: colorTheme.text,
                          letterSpacing: '0.05em', 
                          textTransform: 'uppercase' 
                        }}>
                          Allocation #{index + 1}
                        </span>
                        {splits.length > 1 && (
                          <button 
                            type="button"
                            onClick={() => handleRemoveSplit(split.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--color-rose-500)', padding: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.8 }}
                            title="Remove this split allocation"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>

                      {/* Split Row 1: Amount & Category Toggle */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', alignItems: 'center' }}>
                        <input 
                          type="number"
                          step="0.01"
                          required
                          className="form-input"
                          style={{ padding: '6px 8px', fontSize: '0.8rem', boxSizing: 'border-box', margin: 0 }}
                          value={split.amount}
                          onChange={(e) => handleSplitChange(split.id, 'amount', e.target.value)}
                          placeholder="Amount ($)"
                        />

                        <div className="cost-toggle-container" style={{ margin: 0, padding: '2px', height: '28px' }}>
                          <button 
                            type="button"
                            onClick={() => handleSplitChange(split.id, 'costCategory', 'material')}
                            className={`cost-toggle-btn ${split.costCategory === 'material' ? 'active material' : ''}`}
                            style={{ padding: '2px', fontSize: '0.68rem', border: 'none', height: '100%', flex: 1 }}
                          >
                            Mat
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleSplitChange(split.id, 'costCategory', 'labor')}
                            className={`cost-toggle-btn ${split.costCategory === 'labor' ? 'active labor' : ''}`}
                            style={{ padding: '2px', fontSize: '0.68rem', border: 'none', height: '100%', flex: 1 }}
                          >
                            Lab
                          </button>
                        </div>
                      </div>

                      {/* Split Row 2: Lot Number & Description */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '8px' }}>
                        <select
                          required
                          className="form-input"
                          style={{ padding: '6px 8px', fontSize: '0.8rem', boxSizing: 'border-box', margin: 0 }}
                          value={split.lotNumber}
                          onChange={(e) => handleSplitChange(split.id, 'lotNumber', e.target.value)}
                        >
                          <option value="">Select Lot</option>
                          {projects.map(p => (
                            <option key={p.id} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <input 
                          type="text"
                          className="form-input"
                          style={{ padding: '6px 8px', fontSize: '0.8rem', boxSizing: 'border-box', margin: 0 }}
                          value={split.description}
                          onChange={(e) => handleSplitChange(split.id, 'description', e.target.value)}
                          placeholder="Split description..."
                        />
                      </div>

                      {/* Split Row 3: Trade Category & Phase */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '8px' }}>
                        <select
                          className="form-input"
                          style={{ padding: '6px 8px', fontSize: '0.75rem', margin: 0 }}
                          value={split.tradeCategory || 'Mechanicals_&_Utilities'}
                          onChange={(e) => {
                            const cat = e.target.value;
                            const defPhase = TRADE_SECTIONS_CONFIG[cat]?.phases[0] || '';
                            handleSplitChange(split.id, 'tradeCategory', cat);
                            handleSplitChange(split.id, 'tradePhase', defPhase);
                          }}
                        >
                          {Object.keys(TRADE_SECTIONS_CONFIG).map(catKey => (
                            <option key={catKey} value={catKey}>
                              {TRADE_SECTIONS_CONFIG[catKey].label}
                            </option>
                          ))}
                        </select>

                        <select
                          className="form-input"
                          style={{ padding: '6px 8px', fontSize: '0.75rem', margin: 0 }}
                          value={split.tradePhase || ''}
                          onChange={(e) => handleSplitChange(split.id, 'tradePhase', e.target.value)}
                        >
                          {(TRADE_SECTIONS_CONFIG[split.tradeCategory || 'Mechanicals_&_Utilities']?.phases || []).map(p => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            
            {/* Line Items Allocator Section */}
              {stagedItem.metadata.lineItems && stagedItem.metadata.lineItems.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--color-zinc-800)', paddingTop: '12px', marginTop: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-amber-400)' }}>Allocate Line Items</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--color-zinc-500)' }}>Select the destination lot for each item. Amounts update automatically.</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                    {stagedItem.metadata.lineItems.map((item, idx) => {
                      const allocatedSplitId = itemAllocations[idx];
                      return (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-850)', padding: '8px 10px', borderRadius: '6px', gap: '10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: '0.74rem', color: 'var(--color-zinc-200)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }} title={item.description}>
                              {item.description}
                            </span>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-zinc-400)' }}>
                              ${Number(item.price || 0).toFixed(2)}
                            </span>
                          </div>
                          
                          <select
                            value={allocatedSplitId || ''}
                            onChange={(e) => handleAllocateItem(idx, e.target.value)}
                            className="form-input"
                            style={{
                              width: 'auto',
                              minWidth: '150px',
                              maxWidth: '220px',
                              padding: '4px 8px',
                              fontSize: '0.72rem',
                              margin: 0,
                              borderColor: (() => {
                                const sIdx = splits.findIndex(s => s.id === allocatedSplitId);
                                return sIdx !== -1 ? ALLOCATION_COLORS[sIdx % ALLOCATION_COLORS.length].border : 'var(--color-zinc-800)';
                              })(),
                              backgroundColor: 'var(--color-zinc-900)',
                              color: '#fff',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontWeight: 700,
                              outline: 'none',
                              transition: 'border-color 0.15s ease'
                            }}
                          >
                            {splits.map((s, sIdx) => {
                              const allLotsSame = splits.length > 1 && splits.every(sp => sp.lotNumber === splits[0].lotNumber);
                              const label = allLotsSame 
                                ? `#${sIdx + 1}: ${s.tradePhase || 'Trade?'}` 
                                : `${s.lotNumber || 'Lot ?'} (${s.tradePhase || 'Trade?'})`;
                              return (
                                <option key={s.id} value={s.id} style={{ backgroundColor: 'var(--color-zinc-900)', color: '#fff' }}>
                                  {label}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* File attachments upload sections */}
        <div className="form-group" style={{ marginTop: '4px' }}>
          <label className="form-label" style={{ fontSize: '0.72rem' }}>Attachments</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            
            {/* Primary Image Thumbnail */}
            {mainImageUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px', backgroundColor: 'var(--color-zinc-950)', borderRadius: '8px', border: '1px solid var(--color-zinc-800)' }}>
                <img src={mainImageUrl} alt="Primary Scan" style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Primary scan</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-zinc-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Original receipt or check photo</div>
                </div>
              </div>
            )}

            {/* Secondary Image Attachment */}
            {secondaryImageUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px', backgroundColor: 'var(--color-zinc-950)', borderRadius: '8px', border: '1px solid var(--color-zinc-800)' }}>
                <img src={secondaryImageUrl} alt="Attached Receipt" style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Attached Receipt</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-zinc-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Additional paper receipt reference</div>
                </div>
                <button 
                  type="button" 
                  onClick={handleRemoveReceipt}
                  className="nav-item" 
                  style={{ width: 'auto', padding: '6px', color: 'var(--color-rose-500)', flex: 'none' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {cameraError && (
                  <div className="alert-box alert-error" style={{ padding: '6px', fontSize: '0.75rem' }}>
                    {cameraError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {/* Take Photo Button - triggers WebRTC camera */}
                  <button 
                    type="button" 
                    onClick={startCamera}
                    className="btn btn-secondary" 
                    style={{ borderStyle: 'dashed', padding: '8px', fontSize: '0.8rem', flex: 1, height: '36px' }}
                  >
                    <Camera size={14} />
                    Take Photo
                  </button>

                  {/* Choose from Gallery Overlay Button */}
                  <div style={{ position: 'relative', flex: 1 }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      style={{ borderStyle: 'dashed', padding: '8px', fontSize: '0.8rem', width: '100%', height: '36px' }}
                    >
                      <Plus size={14} />
                      Choose Photo
                    </button>
                    <input 
                      type="file" 
                      onChange={handleFileChange}
                      accept="image/*"
                      style={{ 
                        position: 'absolute', 
                        top: 0, 
                        left: 0, 
                        width: '100%', 
                        height: '100%', 
                        opacity: 0, 
                        cursor: 'pointer',
                        zIndex: 10
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
          <button type="button" onClick={onCancel} className="btn btn-secondary" style={{ flex: 1, padding: '10px', fontSize: '0.85rem', height: '40px' }}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" style={{ flex: 1.5, padding: '10px', fontSize: '0.85rem', height: '40px' }}>
            <Save size={14} /> Save Changes
          </button>
        </div>

      </form>
    </div>
  );
}
