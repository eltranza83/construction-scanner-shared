import React from 'react';
import { AlertTriangle, MapPin, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import BlueprintSelectedPinCard from './BlueprintSelectedPinCard';

export default function BlueprintCanvasView({
  imageContainerRef,
  imageSrc,
  isAddMode,
  onCanvasClick,
  onDeletePin,
  onResetBlueprint,
  onSelectPin,
  onSetZoomScale,
  onToggleAddMode,
  pins,
  selectedPin,
  tradeSectionsConfig,
  zoomScale
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-800)', padding: '10px 14px', borderRadius: '10px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-zinc-400)', fontWeight: 600 }}>Interactive Blueprint</span>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>{pins.length} active installation pins</span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
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
            {isAddMode ? 'Tap Canvas...' : 'Add Pin'}
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
            onClick={onCanvasClick}
            style={{
              display: 'block',
              maxWidth: '100%',
              height: 'auto',
              pointerEvents: 'auto'
            }}
          />

          {pins.map(pin => {
            const config = tradeSectionsConfig[pin.category] || { color: '#71717a' };
            const isSelected = selectedPin?.id === pin.id;

            return (
              <div
                key={pin.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPin(pin);
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

        <div style={{ position: 'absolute', bottom: '12px', right: '12px', display: 'flex', flexDirection: 'column', gap: '6px', zIndex: 50 }}>
          <button
            onClick={() => onSetZoomScale(s => Math.min(s + 0.25, 3.0))}
            style={{ width: '28px', height: '28px', backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-800)', borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <ZoomIn size={14} style={{ margin: 'auto' }} />
          </button>
          <button
            onClick={() => onSetZoomScale(s => Math.max(s - 0.25, 0.75))}
            style={{ width: '28px', height: '28px', backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-800)', borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <ZoomOut size={14} style={{ margin: 'auto' }} />
          </button>
          <button
            onClick={() => onSetZoomScale(1)}
            style={{ width: '28px', height: '28px', backgroundColor: 'var(--color-zinc-950)', border: '1px solid var(--color-zinc-800)', borderRadius: '6px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <RotateCcw size={12} style={{ margin: 'auto' }} />
          </button>
        </div>
      </div>

      <BlueprintSelectedPinCard
        pin={selectedPin}
        tradeSectionsConfig={tradeSectionsConfig}
        onClose={() => onSelectPin(null)}
        onDelete={onDeletePin}
      />
    </div>
  );
}
