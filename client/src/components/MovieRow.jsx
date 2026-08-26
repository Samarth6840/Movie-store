import React, { useState, useRef, useEffect } from 'react';
import TrailerPlayer from './TrailerPlayer.jsx';
import LikeButton from './LikeButton.jsx';

export default function MovieRow({ movie, isExpanded, onToggle, seed, locale }) {
  const rowRef = useRef(null);

  useEffect(() => {
    if (isExpanded && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isExpanded]);

  const castDisplay = movie.cast?.slice(0, 3).join(', ') ?? '';
  const trailerUrl = `/api/trailer/${seed}/${locale}/${movie.index - 1}`;
  const posterUrl = `/api/poster/${seed}/${locale}/${movie.index - 1}`;

  return (
    <>
      <tr
        className={`movie-row ${isExpanded ? 'expanded' : ''}`}
        onClick={onToggle}
        ref={rowRef}
      >
        <td className="col-index">{movie.index}</td>
        <td className="col-genre">{movie.genre}</td>
        <td className="col-title">
          {movie.title}
        </td>
        <td className="col-cast">{castDisplay}</td>
        <td className="col-year">{movie.year}</td>
        <td className="col-expand">
          <span className={`chevron ${isExpanded ? 'open' : ''}`}>&#9662;</span>
        </td>
      </tr>
      {isExpanded && (
        <tr className="expanded-row">
          <td colSpan="6">
            <div className="expanded-content">
              <div className="expanded-left">
                <TrailerPlayer
                  src={trailerUrl}
                  poster={posterUrl}
                  title={movie.title}
                />
                <div className="like-row">
                  <LikeButton movieKey={movie.key} />
                </div>
              </div>
              <div className="expanded-right">
                <h2 className="movie-title">{movie.title}</h2>
                <p className="movie-meta">
                  {movie.year}, {movie.genre} &middot; {movie.runtime} min &middot; {movie.certification}
                </p>
                <p className="movie-cast">
                  <strong>Cast:</strong> {movie.cast?.join(', ')}
                </p>
                <p className="movie-director">
                  <strong>Director:</strong> {movie.director}
                </p>
                <p className="movie-synopsis">{movie.synopsis}</p>
                {movie.reviews?.length > 0 && (
                  <div className="movie-reviews">
                    <h3>Reviews</h3>
                    {movie.reviews.map((review, i) => (
                      <blockquote key={i} className="review">
                        <p>&ldquo;{review.text}&rdquo;</p>
                        <cite>
                          &mdash; {review.author}, <em>{review.outlet}</em>
                        </cite>
                      </blockquote>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
