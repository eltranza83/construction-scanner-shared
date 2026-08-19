import React, { useState, useEffect, useRef } from 'react';
import { FileText, Download, ExternalLink, X, Loader2, AlertTriangle, Activity } from 'lucide-react';
import {
  resolveDocumentViewPlan,
  RENDER_MODES,
  detectBrowserCapabilities
} from '../services/documentViewerService';

export default function DocumentViewerModal({ file, token, onClose }) {
  const [viewPlan, setViewPlan] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasIframeError, setHasIframeError] = useState(false);
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previousActiveElement = useRef(null);

  // Focus management and keyboard accessibility
  useEffect(() => {
    previousActiveElement.current = document.activeElement;
    if (closeButtonRef.current) {
      closeButtonRef.current.focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }

      // Simple focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'a[href], button:not([disabled]), textarea, input, select'
        );
        if (focusableElements.length > 0) {
          const first = focusableElements[0];
          const last = focusableElements[focusableElements.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    };
  }, [onClose]);

  // Strategy resolution & lifecycle
  useEffect(() => {
    if (!file) return;
    let isSubscribed = true;

    async function loadPlan() {
      setIsLoading(true);
      setHasIframeError(false);
      try {
        const capabilities = detectBrowserCapabilities();
        const plan = await resolveDocumentViewPlan(file, token, capabilities);
        if (isSubscribed) {
          setViewPlan(plan);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Error resolving document view plan:', err);
        if (isSubscribed) {
          setIsLoading(false);
        }
      }
    }

    loadPlan();
    return () => {
      isSubscribed = false;
      if (viewPlan?.srcUrl && viewPlan?.strategyId === 'blob_embed') {
        try {
          URL.revokeObjectURL(viewPlan.srcUrl);
        } catch (_) {}
      }
    };
  }, [file, token]);

  if (!file) return null;

  const fileName = file.fileName || file.name || 'Document Preview';
  const folderName = file.folderName || file.parentName || 'Google Drive';

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Document viewer for ${fileName}`}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100000,
        backgroundColor: 'rgba(0, 0, 0, 0.92)',
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-zinc-800)',
          backgroundColor: 'rgba(24, 24, 27, 0.95)',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <FileText size={20} style={{ color: 'var(--color-amber-400)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: '#fff',
                fontSize: '0.92rem',
                fontWeight: 800,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {fileName}
            </div>
            <div style={{ color: 'var(--color-zinc-400)', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📁 {folderName}</span>
              {viewPlan?.strategyName && (
                <span style={{ color: 'var(--color-amber-500)', opacity: 0.9, display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Activity size={10} /> {viewPlan.strategyName} ({viewPlan.durationMs}ms)
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {viewPlan?.downloadUrl && (
            <a
              href={viewPlan.downloadUrl}
              download={fileName}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Download Document"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: 'var(--color-zinc-200)',
                border: '1px solid var(--color-zinc-700)',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 700,
                textDecoration: 'none',
                cursor: 'pointer'
              }}
            >
              <Download size={14} />
              <span className="hidden sm:inline">Save</span>
            </a>
          )}

          {viewPlan?.externalUrl && (
            <a
              href={viewPlan.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in Google Drive"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                backgroundColor: 'var(--color-amber-500)',
                color: '#000',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 800,
                textDecoration: 'none',
                cursor: 'pointer'
              }}
            >
              <ExternalLink size={14} />
              <span>Drive</span>
            </a>
          )}

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close Document Viewer (Escape)"
            style={{
              padding: '6px 10px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              fontSize: '0.75rem',
              fontWeight: 800
            }}
          >
            <X size={16} />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>
      </div>

      {/* Viewer Body */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          backgroundColor: '#09090b',
          padding: '8px'
        }}
      >
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: 'var(--color-amber-400)' }}>
            <Loader2 size={40} className="spin-animation" />
            <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>Resolving optimal viewer strategy...</span>
          </div>
        )}

        {!isLoading && hasIframeError && (
          <div
            style={{
              maxWidth: '400px',
              backgroundColor: 'var(--color-zinc-900)',
              border: '1px solid var(--color-zinc-800)',
              borderRadius: '12px',
              padding: '24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '14px'
            }}
          >
            <AlertTriangle size={36} style={{ color: 'var(--color-amber-400)' }} />
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>
              Preview Restricted by Browser
            </div>
            <div style={{ color: 'var(--color-zinc-400)', fontSize: '0.82rem', lineHeight: 1.5 }}>
              Your browser or security settings restricted inline previewing. You can open this file directly in Google Drive or download it.
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px', width: '100%' }}>
              {viewPlan?.externalUrl && (
                <a
                  href={viewPlan.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: 'var(--color-amber-500)',
                    color: '#000',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <ExternalLink size={16} /> Open in Drive
                </a>
              )}
              {viewPlan?.downloadUrl && (
                <a
                  href={viewPlan.downloadUrl}
                  download={fileName}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: 'var(--color-zinc-800)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Download size={16} /> Download
                </a>
              )}
            </div>
          </div>
        )}

        {!isLoading && !hasIframeError && viewPlan && (
          <>
            {viewPlan.renderMode === RENDER_MODES.IMAGE_DIRECT && (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
                <img
                  src={viewPlan.srcUrl}
                  alt={fileName}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    borderRadius: '8px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                  }}
                />
              </div>
            )}

            {(viewPlan.renderMode === RENDER_MODES.IFRAME_EMBED || viewPlan.renderMode === RENDER_MODES.BLOB_EMBED) && (
              <iframe
                src={viewPlan.srcUrl}
                title={fileName}
                onError={() => setHasIframeError(true)}
                allow="autoplay"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  borderRadius: '8px',
                  backgroundColor: '#fff'
                }}
              />
            )}

            {viewPlan.renderMode === RENDER_MODES.DOWNLOAD_FALLBACK && (
              <div
                style={{
                  maxWidth: '380px',
                  backgroundColor: 'var(--color-zinc-900)',
                  border: '1px solid var(--color-zinc-800)',
                  borderRadius: '12px',
                  padding: '24px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <FileText size={44} style={{ color: 'var(--color-amber-400)' }} />
                <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>{fileName}</div>
                <div style={{ color: 'var(--color-zinc-400)', fontSize: '0.80rem' }}>
                  This file format can be opened in the native app or downloaded.
                </div>
                <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '6px' }}>
                  {viewPlan.externalUrl && (
                    <a
                      href={viewPlan.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        flex: 1,
                        padding: '9px',
                        backgroundColor: 'var(--color-amber-500)',
                        color: '#000',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px'
                      }}
                    >
                      <ExternalLink size={15} /> Open
                    </a>
                  )}
                  {viewPlan.downloadUrl && (
                    <a
                      href={viewPlan.downloadUrl}
                      download={fileName}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        flex: 1,
                        padding: '9px',
                        backgroundColor: 'var(--color-zinc-800)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px'
                      }}
                    >
                      <Download size={15} /> Download
                    </a>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
