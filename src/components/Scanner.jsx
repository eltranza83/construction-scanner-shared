import React, { useRef, useState, useEffect } from 'react';
import { Camera, Image as ImageIcon, Sparkles } from 'lucide-react';
import { extractDocumentData } from '../services/gemini';

/**
 * Resizes and compresses an image client-side in a memory-efficient manner.
 */
function compressImage(file, maxWidth = 1200, maxHeight = 1200) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Clean up reference immediately
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

export default function Scanner({ geminiKey, onDataExtracted, onError }) {
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [localError, setLocalError] = useState(null);

  // WebRTC inline camera states
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const videoRef = useRef(null);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  const startCamera = async () => {
    setLocalError(null);
    if (onError) onError(null);
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
      
      // Delay slightly to ensure video element is rendered
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error('Failed to access camera:', err);
      setLocalError('Could not access front/back camera. Please make sure camera permissions are allowed for this site.');
      if (onError) onError('Could not access camera. Verify browser permissions.');
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
          await processFile(file);
        } else {
          setLocalError('Failed to capture canvas frame.');
        }
      }, 'image/jpeg', 0.85);
      
    } catch (err) {
      console.error('Capture failed:', err);
      setLocalError(`Capture failed: ${err.message}`);
    }
  };

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    await processFile(file);
    
    // Clear value so same file can be re-captured/selected again
    e.target.value = '';
  };

  const processFile = async (file) => {
    setLoading(true);
    setLocalError(null);
    if (onError) onError(null); // clear parent error
    setStatusMessage('Compressing photo...');

    try {
      if (file.size === 0) {
        throw new Error('Captured image is empty. Please try choosing a photo from your gallery instead.');
      }

      // Step 1: Compress the image client-side
      const compressedFile = await compressImage(file);
      
      setStatusMessage('Analyzing document with Gemini AI...');

      // Step 2: Call Gemini AI
      const extractedData = await extractDocumentData(compressedFile, geminiKey);
      
      // Step 3: Callback to parent to stage
      onDataExtracted({
        metadata: extractedData,
        mainImage: compressedFile,
      });
    } catch (err) {
      console.error('Scan process failed:', err);
      const errMsg = err.message || 'AI parsing failed. Please check your API key or connection.';
      setLocalError(errMsg);
      if (onError) onError(errMsg); // propagate to main screen alert box
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  if (showCamera) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Scan Invoice or Check</h2>

      {localError && (
        <div className="alert-box alert-error">
          <strong>Scan Error:</strong> {localError}
        </div>
      )}

      {loading ? (
        <div className="settings-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', gap: '16px' }}>
          <div className="spinner"></div>
          <div style={{ fontWeight: 600, color: 'var(--color-zinc-100)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} className="logo-icon" style={{ animation: 'pulse 1.5s infinite ease-in-out' }} style={{ color: 'var(--color-amber-500)' }} />
            {statusMessage}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-zinc-500)', textAlign: 'center', maxWidth: '280px' }}>
            Processing image and running OCR layout analysis.
          </p>
        </div>
      ) : (
        <div 
          className="scan-area" 
          style={{ height: '320px', cursor: 'default', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '24px' }}
          onClick={(e) => e.stopPropagation()} // prevent clicking background
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <div className="scan-title">Capture Invoice or Check</div>
            <div className="scan-subtitle">Choose how to scan your document:</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '280px', margin: '0 auto' }}>
            {/* Take Photo Button - triggers WebRTC camera */}
            <button 
              type="button" 
              onClick={startCamera}
              className="btn btn-primary"
              style={{ padding: '14px', width: '100%' }}
            >
              <Camera size={18} />
              Take Photo (Use Camera)
            </button>

            {/* Choose from Gallery Overlay Button */}
            <div style={{ position: 'relative', width: '100%' }}>
              <button 
                type="button" 
                className="btn btn-secondary"
                style={{ padding: '14px', width: '100%' }}
              >
                <ImageIcon size={18} />
                Choose from Gallery / Photos
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

          <div style={{ display: 'flex', alignSelf: 'center', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--color-zinc-400)', backgroundColor: 'var(--color-zinc-900)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--color-zinc-800)' }}>
            <Sparkles size={12} style={{ color: 'var(--color-amber-500)' }} />
            Gemini AI Auto-OCR Processing Active
          </div>
        </div>
      )}
    </div>
  );
}
