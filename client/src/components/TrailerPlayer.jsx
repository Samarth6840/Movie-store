import React, { useState, useRef, useCallback } from 'react';

export default function TrailerPlayer({ src, poster, title }) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);

  const handlePlay = useCallback(async () => {
    if (!videoRef.current) return;
    setLoading(true);
    setError(null);
    try {
      await videoRef.current.play();
      setPlaying(true);
    } catch (err) {
      setError('Failed to play trailer');
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePause = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      setPlaying(false);
    }
  }, []);

  return (
    <div className="trailer-player">
      <div className="trailer-container">
        <video
          ref={videoRef}
          className="trailer-video"
          src={src}
          poster={poster}
          controls={playing}
          preload="none"
          onEnded={() => setPlaying(false)}
        />
        {!playing && !loading && (
          <button className="play-btn" onClick={handlePlay} title={`Play ${title}`}>
            &#9654;
          </button>
        )}
        {loading && (
          <div className="trailer-loading">
            <div className="spinner"></div>
          </div>
        )}
        {error && <div className="trailer-error">{error}</div>}
      </div>
    </div>
  );
}
