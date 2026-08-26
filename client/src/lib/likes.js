const STORAGE_KEY = 'movie-store-likes';
const MAX_LIKES = 500;

export const getLikes = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
};

export const getLikeCount = (movieKey) => {
  const likes = getLikes();
  return likes[movieKey] || 0;
};

export const incrementLike = (movieKey) => {
  const likes = getLikes();
  const current = likes[movieKey] || 0;
  if (current < MAX_LIKES) {
    likes[movieKey] = current + 1;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(likes));
  return likes[movieKey];
};

export const decrementLike = (movieKey) => {
  const likes = getLikes();
  const current = likes[movieKey] || 0;
  if (current > 0) {
    likes[movieKey] = current - 1;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(likes));
  return likes[movieKey];
};
