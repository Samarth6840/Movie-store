import React, { useState, useEffect, useCallback, useRef } from 'react';
import Toolbar from './components/Toolbar.jsx';
import TableView from './components/TableView.jsx';
import GalleryView from './components/GalleryView.jsx';

const PAGE_SIZE = 10;

export default function App() {
  const [config, setConfig] = useState(null);
  const [seed, setSeed] = useState('');
  const [locale, setLocale] = useState('en-US');
  const [reviews, setReviews] = useState(2.3);
  const [view, setView] = useState('table');
  const [page, setPage] = useState(1);
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => {
        setConfig(data);
        setSeed(data.defaultSeed);
      })
      .catch(console.error);
  }, []);

  const fetchMovies = useCallback(async () => {
    if (!seed) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        seed,
        locale,
        page: String(page),
        pageSize: String(PAGE_SIZE),
        reviews: String(reviews),
      });
      const res = await fetch(`/api/movies?${params}`, { signal: controller.signal });
      const data = await res.json();
      if (!controller.signal.aborted) {
        setMovies(data.movies ?? []);
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error(err);
    } finally {
      setLoading(false);
    }
  }, [seed, locale, page, reviews]);

  useEffect(() => {
    fetchMovies();
  }, [fetchMovies]);

  const handleSeedChange = useCallback((newSeed) => {
    setSeed(newSeed);
    setPage(1);
  }, []);

  const handleLocaleChange = useCallback((newLocale) => {
    setLocale(newLocale);
    setPage(1);
  }, []);

  const handleReviewsChange = useCallback((newReviews) => {
    setReviews(newReviews);
  }, []);

  const handleViewChange = useCallback((newView) => {
    setView(newView);
    setPage(1);
  }, []);

  if (!config) {
    return <div className="loading">Loading configuration...</div>;
  }

  return (
    <div className="app">
      <Toolbar
        locales={config.locales}
        locale={locale}
        seed={seed}
        reviews={reviews}
        view={view}
        page={page}
        onLocaleChange={handleLocaleChange}
        onSeedChange={handleSeedChange}
        onReviewsChange={handleReviewsChange}
        onViewChange={handleViewChange}
      />
      <main className="content">
        {loading && movies.length === 0 ? (
          <div className="loading">Generating movies...</div>
        ) : view === 'table' ? (
          <TableView
            movies={movies}
            page={page}
            pageSize={PAGE_SIZE}
            seed={seed}
            locale={locale}
            onPageChange={setPage}
          />
        ) : (
          <GalleryView
            seed={seed}
            locale={locale}
            reviews={reviews}
          />
        )}
      </main>
    </div>
  );
}
