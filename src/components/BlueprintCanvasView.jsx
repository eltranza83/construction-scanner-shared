import React from 'react';
import { AlertTriangle, MapPin, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import BlueprintSelectedPinCard from './BlueprintSelectedPinCard';
import IssueCard from './IssueCard';

function getIssueMarkerColor(issue) {
  if (issue.status === 'resolved') return '#34d399';
  if (issue.status === 'in_progress') return '#fbbf24';
  if (issue.priority === 'high') return '#ef4444';
  return '#f87171';
}

function isLocatedIssue(issue) {
  return !issue?.deletedAt && Number.isFinite(Number(issue.floorPlanX)) && Number.isFinite(Number(issue.floorPlanY));
}

export default function BlueprintCanvasView({
  imageContainerRef,
  imageSrc,
  isAddMode,
  isIssueAddMode,
  issues = [],
  onCanvasClick,
  onDeletePin,
  onEditPin,
  onDeleteIssue,
  onEditIssue,
  onOpenPhoto,
  onPrepareIssueShare,
  onResetBlueprint,
  onSelectIssue,
  googleToken,
  onSelectPin,
  onSetZoomScale,
  onToggleIssueAddMode,
  onToggleAddMode,
  onUpdateIssueStatus,
  pins,
  selectedIssue,
  selectedPin,
  tradeSectionsConfig,
  zoomScale
}) {
  const locatedIssues = issues.filter(isLocatedIssue);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-800)', padding: '10px 14px', borderRadius: '10px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-zinc-400)', fontWeight: 600 }}>X-Ray Floor Plan</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>{pins.length} active installation pins</span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onToggleIssueAddMode}
            className={`btn ${isIssueAddMode ? 'btn-primary' : ''}`}
            style={{
              width: 'auto',
              padding: '6px 12px',
              fontSize: '0.75rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: isIssueAddMode ? '#ef4444' : 'var(--color-zinc-800)',
              color: isIssueAddMode ? '#fff' : '#fff',
              border: 'none',
              height: '32px'
            }}
          >
            <AlertTriangle size={14} className={isIssueAddMode ? 'animate-pulse' : ''} />
            {isIssueAddMode ? 'Tap Plan...' : 'Add Issue Pin'}
          </button>

          <button
            onClick={onToggleAddMode}
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
            {isAddMode ? 'Tap Plan...' : 'Add X-Ray Pin'}
          </button>

          <button
            onClick={onResetBlueprint}
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

      {isAddMode && (
        <div style={{ padding: '8px 12px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={14} style={{ color: 'var(--color-emerald-400)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.74rem', color: 'var(--color-emerald-400)' }}>
            Tap anywhere on the floor plan below to drop a pin.
          </span>
        </div>
      )}

      {isIssueAddMode && (
        <div style={{ padding: '8px 12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={14} style={{ color: '#f87171', flexShrink: 0 }} />
          <span style={{ fontSize: '0.74rem', color: '#fca5a5' }}>
            Tap the floor plan to create a punch list issue at that location.
          </span>
        </div>
      )}

      <div
        style={{
          position: 'relative',
          border: '1px solid var(--color-zinc-800)',
          borderRadius: '12px',
          maxHeight: '450px',
          backgroundColor: '#0c0c0e',
          overflow: 'hidden',
          minHeight: '260px'
        }}
      >
        <div
          style={{
            overflow: 'auto',
            maxHeight: '450px',
            minHeight: '260px',
            display: 'flex',
            justifyContent: 'flex-start',
            alignItems: 'flex-start'
          }}
          ref={imageContainerRef}
        >
          <div
            style={{
              position: 'relative',
              width: `${zoomScale * 100}%`,
              flex: '0 0 auto',
              transition: 'width 0.15s ease-out',
              display: 'block',
              cursor: isAddMode ? 'crosshair' : 'default'
            }}
          >
            <img
              src={imageSrc}
              alt="Project Floor Plan"
              onClick={onCanvasClick}
              style={{
                display: 'block',
                width: '100%',
                height: 'auto',
                pointerEvents: 'auto'
              }}
            />

            {pins.map(pin => {
              const config = tradeSectionsConfig[pin.category] || { color: '#71717a' };
              const isSelected = selectedPin?.id === pin.id;

              return (
                <button
                  key={pin.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectIssue(null);
                    onSelectPin(pin);
                  }}
                  style={{
                    position: 'absolute',
                    left: `${pin.x}%`,
                    top: `${pin.y}%`,
                    transform: 'translate(-50%, -50%)',
                    width: isSelected ? '24px' : '16px',
                    height: isSelected ? '24px' : '16px',
                    borderRadius: '50%',
                    backgroundColor: config.color,
                    border: '2px solid #fff',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 0 0 4px rgba(245, 158, 11, 0.35), 0 0 10px rgba(0,0,0,0.5)' : '0 0 10px rgba(0,0,0,0.5)',
                    zIndex: isSelected ? 100 : 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                    padding: 0
                  }}
                  className={isSelected ? '' : 'animate-pulse'}
                  title={pin.phase || 'Pin'}
                >
                  <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#fff' }} />
                </button>
              );
            })}

            {locatedIssues.map(issue => {
              const isSelected = selectedIssue?.id === issue.id;
              const markerColor = getIssueMarkerColor(issue);

              return (
                <button
                  key={issue.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPin(null);
                    onSelectIssue(issue);
                  }}
                  style={{
                    position: 'absolute',
                    left: `${Number(issue.floorPlanX)}%`,
                    top: `${Number(issue.floorPlanY)}%`,
                    transform: 'translate(-50%, -50%)',
                    width: isSelected ? '30px' : '22px',
                    height: isSelected ? '30px' : '22px',
                    borderRadius: '8px',
                    backgroundColor: markerColor,
                    border: '2px solid #fff',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 0 0 4px rgba(239, 68, 68, 0.28), 0 0 10px rgba(0,0,0,0.5)' : '0 0 10px rgba(0,0,0,0.5)',
                    zIndex: isSelected ? 110 : 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                    padding: 0
                  }}
                  title={issue.title || 'Punch issue'}
                >
                  <AlertTriangle size={isSelected ? 16 : 13} style={{ color: '#fff' }} />
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            right: '12px',
            bottom: '12px',
            display: 'flex',
            gap: '6px',
            zIndex: 50,
            padding: '6px',
            borderRadius: '10px',
            background: 'rgba(15, 23, 42, 0.92)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
          }}
        >
          <button
            type="button"
            onClick={() => onSetZoomScale(s => Math.max(s - 0.25, 1))}
            style={{ width: '34px', height: '34px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            title="Zoom out"
          >
            <ZoomOut size={15} />
          </button>
          <button
            type="button"
            onClick={() => onSetZoomScale(s => Math.min(s + 0.25, 3))}
            style={{ width: '34px', height: '34px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            title="Zoom in"
          >
            <ZoomIn size={15} />
          </button>
          <button
            type="button"
            onClick={() => onSetZoomScale(1)}
            style={{ width: '34px', height: '34px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            title="Reset zoom"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {selectedIssue ? (
        <IssueCard
          issue={selectedIssue}
          onUpdateStatus={onUpdateIssueStatus}
          onDelete={onDeleteIssue}
          onEdit={onEditIssue}
          onPrepareShare={onPrepareIssueShare}
        />
      ) : selectedPin ? (
        <BlueprintSelectedPinCard
          pin={selectedPin}
          tradeSectionsConfig={tradeSectionsConfig}
          onClose={() => onSelectPin(null)}
          onDelete={onDeletePin}
          onEditPin={onEditPin}
          onOpenPhoto={onOpenPhoto}
          googleToken={googleToken}
        />
      ) : (
        <div style={{ padding: '12px 14px', border: '1px dashed var(--color-zinc-700)', borderRadius: '10px', color: 'var(--color-zinc-400)', fontSize: '0.78rem', backgroundColor: 'rgba(255,255,255,0.03)' }}>
          Tap a pin on the floor plan to view its details and attached verification photos.
        </div>
      )}
    </div>
  );
}
