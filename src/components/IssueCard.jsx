import React, { useState } from 'react';
import { MessageSquare, Calendar, ChevronDown, Trash2, CheckCircle, Clock, AlertTriangle, X } from 'lucide-react';
import { buildMessageLink, buildMessageText } from '../services/messageLinkHelper';

function getDisplayImageUrl(url, base64, size = 'w200') {
  if (base64) return base64;
  if (!url) return '';
  
  if (url.startsWith('data:')) return url;
  
  const driveIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (driveIdMatch && driveIdMatch[1]) {
    const fileId = driveIdMatch[1];
    const widthParam = size === 'w1000' ? 'w1000' : 'w200';
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=${widthParam}`;
  }
  
  return url;
}

export default function IssueCard({ issue, onUpdateStatus, onDelete }) {
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [isFullscreenPhoto, setIsFullscreenPhoto] = useState(false);

  const {
    id,
    title,
    description,
    category,
    tradePhase,
    contractorName,
    phoneNumber,
    priority,
    status,
    photoUrl,
    createdAt
  } = issue;

  // Format date
  const dateFormatted = createdAt ? new Date(createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: '2-digit'
  }) : 'N/A';

  // Priority Styles
  const getPriorityBadge = () => {
    let text = 'Low';
    let color = 'var(--color-zinc-400)';
    let bg = 'rgba(255, 255, 255, 0.05)';
    let border = 'var(--color-zinc-800)';

    if (priority === 'high') {
      text = 'High';
      color = '#f87171';
      bg = 'rgba(239, 68, 68, 0.08)';
      border = 'rgba(239, 68, 68, 0.2)';
    } else if (priority === 'medium') {
      text = 'Medium';
      color = '#fbbf24';
      bg = 'rgba(245, 158, 11, 0.08)';
      border = 'rgba(245, 158, 11, 0.2)';
    }

    return (
      <span style={{
        fontSize: '0.7rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        padding: '2px 8px',
        borderRadius: '4px',
        color,
        backgroundColor: bg,
        border: `1px solid ${border}`
      }}>
        {text}
      </span>
    );
  };

  // Status Styles
  const getStatusConfig = () => {
    switch (status) {
      case 'resolved':
        return {
          label: 'Resolved',
          color: '#34d399',
          icon: <CheckCircle size={14} style={{ color: '#34d399' }} />
        };
      case 'in_progress':
        return {
          label: 'In Progress',
          color: '#fbbf24',
          icon: <Clock size={14} style={{ color: '#fbbf24' }} />
        };
      default:
        return {
          label: 'Open',
          color: '#f87171',
          icon: <AlertTriangle size={14} style={{ color: '#f87171' }} />
        };
    }
  };

  const statusConfig = getStatusConfig();

  const handleShareClick = (platform) => {
    const link = buildMessageLink(issue, platform);
    window.open(link, '_blank');
    setShowShareMenu(false);
  };

  const handleNativeShare = async () => {
    try {
      let file = null;
      const cachedBase64 = issue.photoBase64 || localStorage.getItem(`jobscan_photo_${issue.id}`);
      
      // If we have local base64, convert to File
      if (cachedBase64) {
        const mimeTypeMatch = cachedBase64.match(/:(.*?);/);
        const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';
        const parts = cachedBase64.split(';base64,');
        const raw = window.atob(parts[1] || parts[0]);
        const rawLength = raw.length;
        const u8arr = new Uint8Array(rawLength);
        for (let i = 0; i < rawLength; ++i) {
          u8arr[i] = raw.charCodeAt(i);
        }
        const blob = new Blob([u8arr], { type: mimeType });
        file = new File([blob], `issue_photo.jpg`, { type: mimeType });
      } else if (issue.photoUrl) {
        try {
          const res = await fetch(issue.photoUrl);
          const blob = await res.blob();
          const mimeType = blob.type || 'image/jpeg';
          file = new File([blob], `issue_photo.jpg`, { type: mimeType });
        } catch (fetchErr) {
          console.warn('Failed to fetch remote photo for native share:', fetchErr);
        }
      }

      const text = buildMessageText(issue);

      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Punch List: ${issue.title}`,
          text: text
        });
      } else if (navigator.share) {
        await navigator.share({
          title: `Punch List: ${issue.title}`,
          text: text
        });
      } else {
        alert('Sharing is not supported on this device/browser.');
      }
    } catch (err) {
      console.warn('Native share failed or cancelled:', err);
      if (err.name !== 'AbortError' && !String(err).includes('cancel')) {
        alert('Share failed: ' + (err.message || err));
      }
    } finally {
      setShowShareMenu(false);
    }
  };

  return (
    <div style={{
      backgroundColor: 'var(--color-zinc-900)',
      border: '1px solid var(--color-zinc-800)',
      borderRadius: '12px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      position: 'relative'
    }}>
      {/* Top row: Priority, Date, Delete */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {getPriorityBadge()}
          <span style={{
            fontSize: '0.75rem',
            color: 'var(--color-zinc-500)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <Calendar size={12} />
            {dateFormatted}
          </span>
        </div>

        <button
          onClick={() => {
            if (confirm('Are you sure you want to delete this issue?')) {
              onDelete(id);
            }
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-zinc-500)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#f87171'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-zinc-500)'}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Main Content Area: Title & Description */}
      <div>
        <h4 style={{
          fontSize: '1rem',
          fontWeight: 600,
          color: 'var(--color-zinc-100)',
          lineHeight: '1.4',
          marginBottom: '4px'
        }}>
          {title}
        </h4>
        {description && (
          <p style={{
            fontSize: '0.85rem',
            color: 'var(--color-zinc-400)',
            lineHeight: '1.5'
          }}>
            {description}
          </p>
        )}
      </div>

      {/* Mid row: Category details & Photo Thumbnail */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-zinc-500)' }}>
            Category: <strong style={{ color: 'var(--color-zinc-300)' }}>{category.replace(/_/g, ' ')}</strong>
          </span>
          {tradePhase && (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-zinc-500)' }}>
              Phase: <strong style={{ color: 'var(--color-zinc-300)' }}>{tradePhase}</strong>
            </span>
          )}
          {(contractorName || phoneNumber) && (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-zinc-500)' }}>
              Assigned: <strong style={{ color: 'var(--color-zinc-300)' }}>{contractorName || 'N/A'} {phoneNumber ? `(${phoneNumber})` : ''}</strong>
            </span>
          )}
        </div>

        {(photoUrl || issue.photoBase64) && (
          <div style={{ position: 'relative' }}>
            <img
              src={getDisplayImageUrl(photoUrl, issue.photoBase64, 'w200')}
              alt="Issue thumbnail"
              onClick={() => setIsFullscreenPhoto(true)}
              style={{
                width: '60px',
                height: '60px',
                objectFit: 'cover',
                borderRadius: '8px',
                cursor: 'pointer',
                border: '1px solid var(--color-zinc-800)'
              }}
            />
          </div>
        )}
      </div>

      {/* Bottom actions row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTop: '1px solid var(--color-zinc-800)',
        paddingTop: '12px',
        marginTop: '4px'
      }}>
        {/* Status Dropdown Trigger */}
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {statusConfig.icon}
            <select
              value={status}
              onChange={(e) => onUpdateStatus(id, e.target.value)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: statusConfig.color,
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                appearance: 'auto',
                paddingRight: '12px'
              }}
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>

        {/* Message Contractor Button */}
        {phoneNumber && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowShareMenu(!showShareMenu)}
              className="btn btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: 'var(--color-zinc-800)'
              }}
            >
              <MessageSquare size={14} />
              <span>Message</span>
              <ChevronDown size={12} />
            </button>

            {showShareMenu && (
              <>
                {/* Overlay backdrop to close share menu */}
                <div 
                  onClick={() => setShowShareMenu(false)}
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 999
                  }}
                />
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  right: 0,
                  marginBottom: '8px',
                  backgroundColor: 'var(--color-zinc-950)',
                  border: '1px solid var(--color-zinc-800)',
                  borderRadius: '8px',
                  padding: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  zIndex: 1000,
                  minWidth: '160px'
                }}>
                  {!issue.photoUrl && (issue.photoBase64 || localStorage.getItem(`jobscan_photo_${issue.id}`)) && (
                    <div style={{
                      padding: '6px 8px',
                      fontSize: '0.68rem',
                      color: 'var(--color-amber-500)',
                      backgroundColor: 'rgba(197, 160, 89, 0.08)',
                      borderBottom: '1px solid var(--color-zinc-800)',
                      borderRadius: '4px 4px 0 0',
                      lineHeight: '1.3',
                      textAlign: 'center'
                    }}>
                      ⚠️ Photo upload pending sync. Direct links won't include photo.
                    </div>
                  )}

                  {(issue.photoBase64 || issue.photoUrl || localStorage.getItem(`jobscan_photo_${issue.id}`)) && (
                    <button
                      onClick={handleNativeShare}
                      style={{
                        padding: '8px 12px',
                        fontSize: '0.8rem',
                        color: 'var(--color-zinc-200)',
                        backgroundColor: 'transparent',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        borderBottom: '1px solid var(--color-zinc-800)'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-zinc-800)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <span style={{ color: 'var(--color-amber-500)', fontWeight: 'bold' }}>📤</span>
                      <span>Share Photo + Text</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleShareClick('whatsapp')}
                    style={{
                      padding: '8px 12px',
                      fontSize: '0.8rem',
                      color: 'var(--color-zinc-200)',
                      backgroundColor: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-zinc-800)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <span style={{ color: '#25d366', fontWeight: 'bold' }}>WA</span>
                    <span>WhatsApp</span>
                  </button>
                  <button
                    onClick={() => handleShareClick('sms')}
                    style={{
                      padding: '8px 12px',
                      fontSize: '0.8rem',
                      color: 'var(--color-zinc-200)',
                      backgroundColor: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-zinc-800)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>SMS</span>
                    <span>Text Message</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Fullscreen Photo Modal */}
      {isFullscreenPhoto && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px',
          backdropFilter: 'blur(8px)'
        }}>
          <button
            onClick={() => setIsFullscreenPhoto(false)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              backgroundColor: 'rgba(0,0,0,0.6)',
              border: 'none',
              borderRadius: '50%',
              color: 'white',
              cursor: 'pointer',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={24} />
          </button>
          <img
            src={getDisplayImageUrl(photoUrl, issue.photoBase64, 'w1000')}
            alt="Fullscreen Issue proof"
            style={{
              maxWidth: '100%',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: '8px'
            }}
          />
        </div>
      )}
    </div>
  );
}
