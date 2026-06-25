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

export default function EditForm({ stagedItem, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    type: stagedItem.metadata.type || 'invoice',
    description: stagedItem.metadata.description || '',
    lotNumber: stagedItem.metadata.lotNumber || '',
    vendor: stagedItem.metadata.vendor || '',
    costCategory: stagedItem.metadata.costCategory || 'material',
    amount: stagedItem.metadata.amount || '',
    date: stagedItem.metadata.date || '',
    checkNumber: stagedItem.metadata.checkNumber || '',
  });

  const [mainImageBase64, setMainImageBase64] = useState(stagedItem.mainImageBase64 || null);
  const [secondaryImageBase64, setSecondaryImageBase64] = useState(stagedItem.secondaryImageBase64 || null);

  const mainImageUrl = mainImageBase64;
  const secondaryImageUrl = secondaryImageBase64;

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
    onSave({
      metadata: {
        ...formData,
        amount: parseFloat(formData.amount) || 0
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
            <input 
              type="text"
              id="edit-lot-number"
              name="lotNumber"
              className="form-input"
              style={{ padding: '8px 12px', fontSize: '0.85rem', width: '100%' }}
              value={formData.lotNumber || ''}
              onChange={handleChange}
              placeholder="e.g. Lot 102"
            />
          </div>
        </div>

        {/* Row 3: Vendor & Amount */}
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
              Amount ($)
            </label>
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
          </div>
        </div>

        {/* Row 4: Transaction Date & Check Number */}
        <div style={{ display: 'grid', gridTemplateColumns: formData.type === 'check' ? '1.4fr 1fr' : '1fr', gap: '12px' }}>
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
            />
          </div>

          {formData.type === 'check' && (
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
