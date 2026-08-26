import React, { useState, useEffect, useCallback, useRef } from 'react';
import TrailerPlayer from './TrailerPlayer.jsx';
import LikeButton from './LikeButton.jsx';

const BATCH_SIZE = 24;

export default function GalleryView({ seed, locale, reviews }) {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const observerRef = useRef(null);
  const sentinelRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    setMovies([]);
    setPage(1);
    setHasMore(true);
  }, [seed, locale, reviews]);

  const fetchBatch = useCallback(async (pageNum) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        seed,
        locale,
        page: String(pageNum),
        pageSize: String(BATCH_SIZE),
        reviews: String(reviews),
      });
      const res = await fetch(`/api/movies?${params}`, { signal: controller.signal });
      const data = await res.json();
      if (!controller.signal.aborted) {
        setMovies((prev) => [...prev, ...(data.movies ?? [])]);
        setHasMore((data.movies?.length ?? 0) === BATCH_SIZE);
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error(err);
    } finally {
      setLoading(false);
    }
  }, [seed, locale, reviews]);

  useEffect(() => {
    fetchBatch(page);
  }, [page, fetchBatch]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          setPage((prev) => prev + 1);
        }
      },
      { threshold: 0.1 },
    );
    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }
    return () => observerRef.current?.disconnect();
  }, [hasMore, loading]);

  return (
    <div className="gallery-view">
      <div className="gallery-grid">
        {movies.map((movie) => (
          <GalleryCard key={movie.key} movie={movie} seed={seed} locale={locale} />
        ))}
      </div>
      {loading && <div className="loading">Loading more...</div>}
      <div ref={sentinelRef} className="sentinel" />
    </div>
  );
}

function GalleryCard({ movie, seed, locale }) {
  const [expanded, setExpanded] = useState(false);
  const [posterLoaded, setPosterLoaded] = useState(false);
  const posterUrl = `/api/poster/${seed}/${locale}/${movie.index - 1}`;
  const trailerUrl = `/api/trailer/${seed}/${locale}/${movie.index - 1}`;

  return (
    <div className={`gallery-card ${expanded ? 'expanded' : ''}`}>
      <div className="card-poster" onClick={() => setExpanded(!expanded)}>
        {!posterLoaded && <div className="poster-placeholder" />}
        <img
          src={posterUrl}
          alt={movie.title}
          loading="lazy"
          onLoad={() => setPosterLoaded(true)}
          style={{ opacity: posterLoaded ? 1 : 0 }}
        />
        <div className="card-overlay">
          <h3 className="card-title">{movie.title}</h3>
          <p className="card-meta">{movie.year} &middot; {movie.genre}</p>
        </div>
      </div>
      {expanded && (
        <div className="card-details">
          <TrailerPlayer src={trailerUrl} poster={posterUrl} title={movie.title} />
          <p className="card-cast"><strong>Cast:</strong> {movie.cast?.join(', ')}</p>
          <p className="card-director"><strong>Director:</strong> {movie.director}</p>
          <p className="card-synopsis">{movie.synopsis}</p>
          <div className="like-row">
            <LikeButton movieKey={movie.key} />
          </div>
        </div>
      )}
    </div>
  );
}
