import { HelpCircle } from 'lucide-react';

export default function SettingsHelpCard() {
  return (
    <div className="settings-card" style={{ border: '1px solid var(--color-zinc-800)', marginTop: '4px' }}>
      <h3 className="settings-title" style={{ color: 'var(--color-zinc-200)', marginBottom: '8px' }}>
        <HelpCircle size={18} style={{ color: 'var(--color-amber-500)' }} />
        How it works
      </h3>
      <ol style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', color: 'var(--color-zinc-400)', lineHeight: '1.5' }}>
        <li>Snap a photo of your receipt or check using your camera, or select an existing image from your gallery.</li>
        <li>The AI extracts description, totals, and category.</li>
        <li>Review details and optionally attach a receipt before uploading to Drive.</li>
      </ol>
    </div>
  );
}
