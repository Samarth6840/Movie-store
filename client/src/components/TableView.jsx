import React, { useState, useCallback } from 'react';
import MovieRow from './MovieRow.jsx';

export default function TableView({ movies, page, pageSize, seed, locale, onPageChange }) {
  const [expandedIndex, setExpandedIndex] = useState(null);

  const toggleExpand = useCallback((index) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  }, []);

  return (
    <div className="table-view">
      <table className="movie-table">
        <thead>
          <tr>
            <th className="col-index">#</th>
            <th className="col-genre">Genre</th>
            <th className="col-title">Title</th>
            <th className="col-cast">Cast</th>
            <th className="col-year">Year</th>
            <th className="col-expand"></th>
          </tr>
        </thead>
        <tbody>
          {movies.map((movie) => (
            <MovieRow
              key={movie.key}
              movie={movie}
              isExpanded={expandedIndex === movie.index}
              onToggle={() => toggleExpand(movie.index)}
              seed={seed}
              locale={locale}
            />
          ))}
        </tbody>
      </table>

      <Pagination page={page} onPageChange={onPageChange} />
    </div>
  );
}

function Pagination({ page, onPageChange }) {
  const maxVisible = 5;
  const start = Math.max(1, page - Math.floor(maxVisible / 2));
  const end = start + maxVisible - 1;

  const pages = [];
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <nav className="pagination">
      <button
        className="page-btn"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        &laquo;
      </button>
      {pages.map((p) => (
        <button
          key={p}
          className={`page-btn ${p === page ? 'active' : ''}`}
          onClick={() => onPageChange(p)}
        >
          {p}
        </button>
      ))}
      <button
        className="page-btn"
        onClick={() => onPageChange(page + 1)}
      >
        &raquo;
      </button>
    </nav>
  );
}
