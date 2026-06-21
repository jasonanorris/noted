const CACHE_NAME = 'knowledge-app-cache-v2';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
];

// Cache strategies:
// - Static assets (CSS, JS, images): Cache-first with network fallback
// - API calls: Stalegic caching with background sync
// - Dynamic content: Network-first with cache fallback

const STATIC_CACHE_NAME = 'static-assets-v2';
const API_CACHE_NAME = 'api-cache-v1';
const DYNAMIC_CACHE_NAME = 'dynamic-content-v1';

// Install event - set up caches and precache essential resources
self.addEventListener('install', () => {
  // Create all cache buckets
  const cachePromises = [
    caches.open(CACHE_NAME),
    caches.open(STATIC_CACHE_NAME),
    caches.open(API_CACHE_NAME),
    caches.open(DYNAMIC_CACHE_NAME)
  ];

  Promise.all(cachePromises).then(() => {
    return self.skipWaiting();
  });
});

// Activate event - make the service worker active and claim clients
self.addEventListener('activate', () => {
  clients.claim();
});

// Fetch event - handle requests with appropriate cache strategy
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Static assets: Cache-first strategy
  if (url.pathname.match(/\.(css|js|png|jpg|svg)$/) ||
    url.pathname === '/manifest.json') {
    return handleStaticAssets(event, request);
  }

  // API calls: Stalegic caching with background sync
  if (request.url.includes('/api/')) {
    return handleAPICalls(event, request);
  }

  // HTML pages and other dynamic content: Network-first with cache fallback
  if (url.pathname === '/' || url.pathname.startsWith('/app/') ||
    url.pathname.endsWith('.html')) {
    return handleDynamicContent(event, request);
  }

  // Default: Cache-first for everything else
  return caches.open(CACHE_NAME).then((cache) => {
    return cache.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        const responseClone = response.clone();
        cache.put(request, responseClone);
        return response;
      }).catch(() => {
        // Return a fallback if offline
        return caches.match('/');
      });
    });
  });
});

// Static assets: Cache-first strategy with network fallback
async function handleStaticAssets(event, request) {
  const cache = await caches.open(STATIC_CACHE_NAME);

  try {
    // Try to get from cache first
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // If not in cache, fetch from network and cache it
    const response = await fetch(request);
    const responseClone = response.clone();
    cache.put(request, responseClone);

    return response;
  } catch (error) {
    console.error('Static asset fetch failed:', error);
    // Return a generic fallback for static assets
    return new Response('', { status: 404 });
  }
}

// API calls: Stalegic caching with background sync
async function handleAPICalls(event, request) {
  const cache = await caches.open(API_CACHE_NAME);

  try {
    // Try to get from cache first
    const cachedResponse = await cache.match(request);

    if (cachedResponse && !request.url.includes('refresh=true')) {
      // Return cached response and update in background
      const freshResponse = fetchAndCacheAPI(event, request, cache);

      return new Response(cachedResponse.body, {
        headers: cachedResponse.headers
      });
    }

    // If no cache or refresh requested, fetch from network
    const response = await fetch(request);

    if (response.ok) {
      const responseClone = response.clone();

      // Cache the response with a short TTL (e.g., 30 seconds for API data)
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'max-age=30');

      const cachedResponse = new Response(response.body, { headers });
      cache.put(request, cachedResponse);

      return response;
    }

    // If API call failed, try to get from cache as fallback
    if (cachedResponse) {
      return new Response(cachedResponse.body, {
        headers: cachedResponse.headers
      });
    }

    return response;
  } catch (error) {
    console.error('API fetch failed:', error);

    // Return cached data as fallback if available
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return new Response(cachedResponse.body, {
        headers: cachedResponse.headers
      });
    }

    // Return a generic error response
    return new Response(JSON.stringify({
      error: 'Network unavailable',
      data: null
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Background sync for API calls
async function fetchAndCacheAPI(event, request, cache) {
  try {
    const response = await fetch(request);

    if (response.ok) {
      const responseClone = response.clone();

      // Cache the fresh response
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'max-age=30');

      const cachedResponse = new Response(response.body, { headers });
      cache.put(request, cachedResponse);
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// Dynamic content: Network-first with cache fallback
async function handleDynamicContent(event, request) {
  const cache = await caches.open(DYNAMIC_CACHE_NAME);

  try {
    // Try to get from cache first
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // If not in cache, fetch from network and cache it
    const response = await fetch(request);
    const responseClone = response.clone();
    cache.put(request, responseClone);

    return response;
  } catch (error) {
    console.error('Dynamic content fetch failed:', error);
    // Return a fallback if offline
    return caches.match('/');
  }
}

// Message event for cache management and updates
self.addEventListener('message', async (event) => {
  const data = event.data;

  switch (data.type) {
    case 'clear-cache':
      await clearAllCaches();
      break;

    case 'update-static-assets':
      await updateStaticAssets(data.urls);
      break;

    case 'invalidate-api-cache':
      await invalidateAPICache(data.urlPattern);
      break;

    case 'sync-data':
      await syncData(data.data);
      break;
  }
});

// Clear all caches
async function clearAllCaches() {
  const cacheNames = await caches.keys();

  for (const name of cacheNames) {
    await caches.delete(name);
  }

  // Notify clients that cache was cleared
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => client.postMessage({ type: 'cache-cleared' }));
  });
}

// Update static assets (useful for app updates)
async function updateStaticAssets(urls) {
  const cache = await caches.open(STATIC_CACHE_NAME);

  // Remove old versions of the files
  const allRequests = await cache.keys();
  for (const request of allRequests) {
    if (!urls.includes(request.url)) {
      await cache.delete(request);
    }
  }

  // Precache new assets
  await cache.addAll(urls);
}

// Invalidate API cache entries matching a pattern
async function invalidateAPICache(urlPattern) {
  const cache = await caches.open(API_CACHE_NAME);
  const allRequests = await cache.keys();

  for (const request of allRequests) {
    if (request.url.match(new RegExp(urlPattern))) {
      await cache.delete(request);
    }
  }
}

// Sync data with server when online
async function syncData(data) {
  try {
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({
          type: 'sync-complete',
          data: response.data
        }));
      });
    }
  } catch (error) {
    console.error('Sync failed:', error);

    // Queue sync for later when online
    queueSync(data);
  }
}

// Queue sync operations for offline processing
function queueSync(data) {
  const syncQueue = JSON.parse(localStorage.getItem('sync-queue') || '[]');
  syncQueue.push({ data, timestamp: Date.now() });
  localStorage.setItem('sync-queue', JSON.stringify(syncQueue));

  // Trigger sync when online
  navigator.ononline = () => processSyncQueue();
}

// Process queued sync operations
async function processSyncQueue() {
  const syncQueue = JSON.parse(localStorage.getItem('sync-queue') || '[]');

  for (const item of syncQueue) {
    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.data)
      });

      if (response.ok) {
        // Remove from queue on success
        syncQueue.splice(syncQueue.indexOf(item), 1);
        localStorage.setItem('sync-queue', JSON.stringify(syncQueue));
      } else {
        break; // Stop processing on first failure
      }
    } catch (error) {
      console.error('Sync failed:', error);
      break;
    }
  }
}

// Periodic cache cleanup to prevent storage bloat
self.addEventListener('periodic-sync', async () => {
  await cleanupOldCaches();
});

async function cleanupOldCaches() {
  const maxCacheSize = 50 * 1024 * 1024; // 50MB limit

  for (const cacheName of [STATIC_CACHE_NAME, API_CACHE_NAME, DYNAMIC_CACHE_NAME]) {
    try {
      const cache = await caches.open(cacheName);
      const allRequests = await cache.keys();

      let totalSize = 0;
      const requestsToDelete = [];

      for (const request of allRequests) {
        const response = await cache.match(request);
        if (response) {
          const size = await response.arrayBuffer().then(buffer => buffer.byteLength);
          totalSize += size;

          // Delete old entries (> 1 hour)
          const lastModified = response.headers.get('last-modified');
          if (lastModified && new Date(lastModified).getTime() < Date.now() - 60 * 60 * 1000) {
            requestsToDelete.push(request);
          }
        }
      }

      // Delete old entries
      for (const request of requestsToDelete) {
        await cache.delete(request);
      }

      // Trim cache if it exceeds size limit
      if (totalSize > maxCacheSize) {
        const sortedRequests = allRequests.sort((a, b) => {
          return new Date(b.lastModified || 0).getTime() -
            new Date(a.lastModified || 0).getTime();
        });

        let trimmedSize = totalSize;
        for (const request of sortedRequests.reverse()) {
          if (trimmedSize <= maxCacheSize) break;

          const response = await cache.match(request);
          if (response) {
            const size = await response.arrayBuffer().then(buffer => buffer.byteLength);
            trimmedSize -= size;
            await cache.delete(request);
          }
        }
      }
    } catch (error) {
      console.error('Cache cleanup failed:', error);
    }
  }
}

// Handle offline/online events to trigger sync when available
self.addEventListener('online', () => {
  processSyncQueue();
});

self.addEventListener('offline', () => {
  // Notify clients about offline status
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => client.postMessage({ type: 'offline-status' }));
  });
});
