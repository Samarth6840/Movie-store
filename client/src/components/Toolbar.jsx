import React, { useCallback } from 'react';

export default function Toolbar({
  locales,
  locale,
  seed,
  reviews,
  view,
  page,
  onLocaleChange,
  onSeedChange,
  onReviewsChange,
  onViewChange,
}) {
  const shuffleSeed = useCallback(() => {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const newSeed = bytes.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n).toString();
    onSeedChange(newSeed);
  }, [onSeedChange]);

  const handleExport = useCallback(() => {
    const params = new URLSearchParams({
      seed,
      locale,
      page: String(page || 1),
      pageSize: '10',
      reviews: String(reviews),
    });
    window.location.href = `/api/export?${params}`;
  }, [seed, locale, page, reviews]);

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <label className="toolbar-label">
          Language
          <select
            className="toolbar-select"
            value={locale}
            onChange={(e) => onLocaleChange(e.target.value)}
          >
                {locales.map((loc) => (
                  <option key={loc.code} value={loc.code}>
                    {loc.label}
                  </option>
                ))}
          </select>
        </label>
      </div>

      <div className="toolbar-group">
        <label className="toolbar-label">
          Seed
          <input
            className="toolbar-input"
            type="text"
            value={seed}
            onChange={(e) => onSeedChange(e.target.value)}
          />
        </label>
        <button className="toolbar-btn" onClick={shuffleSeed} title="Random seed">
          &#x21BB;
        </button>
      </div>

      <div className="toolbar-group">
        <label className="toolbar-label">
          Reviews
          <input
            className="toolbar-number"
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={reviews}
            onChange={(e) => onReviewsChange(parseFloat(e.target.value) || 0)}
          />
        </label>
      </div>

      <div className="toolbar-group toolbar-toggle">
        <button
          className={`toggle-btn ${view === 'table' ? 'active' : ''}`}
          onClick={() => onViewChange('table')}
          title="Table View"
        >
          &#9776;
        </button>
        <button
          className={`toggle-btn ${view === 'gallery' ? 'active' : ''}`}
          onClick={() => onViewChange('gallery')}
          title="Gallery View"
        >
          &#9638;
        </button>
      </div>

      {view === 'table' && (
        <div className="toolbar-group">
          <button className="toolbar-btn export-btn" onClick={handleExport} title="Export current page as ZIP">
            &#8615; Export
          </button>
        </div>
      )}
    </header>
  );
}
