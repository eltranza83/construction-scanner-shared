import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export default function ToastNotification({ message, type = 'success', onClose, duration = 3500 }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  const isSuccess = type === 'success';

  return (
    <div style={{
      position: 'fixed',
      bottom: '76px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '10px 16px',
      borderRadius: '30px',
      backgroundColor: isSuccess ? 'rgba(10, 10, 10, 0.94)' : 'rgba(28, 10, 12, 0.95)',
      border: isSuccess ? '1px solid rgba(197, 160, 89, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: isSuccess
        ? '0 10px 30px rgba(0, 0, 0, 0.6), 0 0 15px rgba(197, 160, 89, 0.25)'
        : '0 10px 30px rgba(0, 0, 0, 0.6), 0 0 15px rgba(239, 68, 68, 0.25)',
      color: isSuccess ? '#ffffff' : '#fca5a5',
      fontSize: '0.78rem',
      fontWeight: 700,
      maxWidth: '90vw',
      width: 'max-content',
      animation: 'toastSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
    }}>
      {isSuccess ? (
        <CheckCircle2 size={16} style={{ color: '#E5C158', flexShrink: 0 }} />
      ) : (
        <AlertCircle size={16} style={{ color: '#f87171', flexShrink: 0 }} />
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {message}
      </span>
      <button
        type="button"
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--color-zinc-400)',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: '4px'
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
