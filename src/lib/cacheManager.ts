import NodeCache from 'node-cache';

// Default TTL for database query results: 1 minute
const DB_CACHE_TTL_SECONDS = 60;

// Cache for general database query results
export const dbQueryCache = new NodeCache({
  stdTTL: DB_CACHE_TTL_SECONDS,
  checkperiod: Math.floor(DB_CACHE_TTL_SECONDS * 0.2), // Periodically check for expired items
  useClones: false // Using clones is safer to prevent accidental modification of cached objects, but has performance overhead. Set to false if objects are treated as immutable.
});

// Example of another cache for different purposes, e.g., longer TTL for less frequently changing data
// const GITHUB_API_CACHE_TTL_SECONDS = 120; // 2 minutes for GitHub API calls
// export const githubApiCache = new NodeCache({
//   stdTTL: GITHUB_API_CACHE_TTL_SECONDS,
//   checkperiod: Math.floor(GITHUB_API_CACHE_TTL_SECONDS * 0.2),
//   useClones: false
// });

// It's good practice to handle potential errors during cache operations,
// though node-cache itself is generally robust. For critical applications,
// you might wrap set/get operations in try-catch or use event listeners for 'expired', 'set', 'del' events if needed for logging.
