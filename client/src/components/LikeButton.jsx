import React, { useState, useEffect } from 'react';
import { getLikeCount, incrementLike, decrementLike } from '../lib/likes.js';

export default function LikeButton({ movieKey }) {
  const [count, setCount] = useState(() => getLikeCount(movieKey));

  useEffect(() => {
    setCount(getLikeCount(movieKey));
  }, [movieKey]);

  const handleIncrement = (e) => {
    e.stopPropagation();
    setCount(incrementLike(movieKey));
  };

  const handleDecrement = (e) => {
    e.stopPropagation();
    setCount(decrementLike(movieKey));
  };

  return (
    <div className="like-control">
      <button
        className="like-btn"
        onClick={handleDecrement}
        disabled={count === 0}
        title="Unlike"
      >
        -
      </button>
      <span className="like-count">{count}</span>
      <button
        className="like-btn"
        onClick={handleIncrement}
        disabled={count >= 500}
        title="Like"
      >
        +
      </button>
    </div>
  );
}
