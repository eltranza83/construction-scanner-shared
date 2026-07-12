import React, { useState } from 'react';
import { Edit3, FileText, Calendar, Trash2, CheckCircle, Clock, AlertTriangle, X } from 'lucide-react';

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

export default function IssueCard({ issue, onUpdateStatus, onDelete, onEdit, onSendPacket }) {
  const [isFullscreenPhoto, setIsFullscreenPhoto] = useState(false);
  const [preparingPacket, setPreparingPacket] = useState(false);

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

  const handleSendPacketClick = async () => {
    if (!onSendPacket || preparingPacket) return;

    try {
      setPreparingPacket(true);
      await onSendPacket(issue);
    } catch (err) {
      console.error('Failed to prepare issue packet:', err);
      alert(err?.message || 'Could not create the issue packet PDF.');
    } finally {
      setPreparingPacket(false);
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(issue)}
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
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-amber-500)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-zinc-500)'}
              title="Edit issue"
            >
              <Edit3 size={16} />
            </button>
          )}
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

        {/* Send Packet Button */}
        {onSendPacket && (
          <div>
            <button
              onClick={handleSendPacketClick}
              className="btn btn-secondary"
              disabled={preparingPacket}
              style={{
                padding: '6px 12px',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: 'var(--color-zinc-800)',
                opacity: preparingPacket ? 0.75 : 1
              }}
            >
              <FileText size={14} />
              <span>{preparingPacket ? 'Preparing...' : 'Send Packet'}</span>
            </button>
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
