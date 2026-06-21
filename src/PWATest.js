import React, { useState, useEffect } from 'react';
import './App.css';

function PWATest() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [serviceWorkerStatus, setServiceWorkerStatus] = useState('checking');
  const [cacheSize, setCacheSize] = useState(0);

  useEffect(() => {
    // Check if app is installed (PWA)
    if ('getAppMetadata' in navigator) {
      navigator.getAppMetadata().then((metadata) => {
        setIsInstalled(true);
      }).catch(() => {
        setIsInstalled(false);
      });
    }

    // Listen for online/offline events
    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));

    // Check service worker status
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration('/sw.js').then((registration) => {
        setServiceWorkerStatus(registration.active ? 'active' : 'inactive');
        
        // Get cache size
        caches.open('knowledge-app-cache-v1').then((cache) => {
          return cache.keys().then((keys) => {
            let totalSize = 0;
            keys.forEach(key => {
              totalSize += key.url.length * 2; // Approximate size
            });
            setCacheSize(totalSize);
          });
        }).catch(() => {
          setCacheSize(0);
        });
      }).catch(() => {
        setServiceWorkerStatus('not-registered');
      });
    } else {
      setServiceWorkerStatus('not-supported');
    }
  }, []);

  const handleClearCache = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration('/sw.js').then((registration) => {
        registration.active.postMessage({ type: 'clear-cache' });
      }).catch(() => {});
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>PWA Test</h1>
        
        <div style={{ marginTop: '20px', textAlign: 'left' }}>
          <p><strong>Status:</strong></p>
          <ul style={{ listStyle: 'none', padding-left: '20px' }}>
            <li>Online: {isOnline ? 'Yes' : 'No'}</li>
            <li>Installed: {isInstalled ? 'Yes' : 'No'}</li>
            <li>Service Worker: {serviceWorkerStatus}</li>
            <li>Cache Size: {(cacheSize / 1024).toFixed(2)} KB</li>
          </ul>
        </div>

        <button 
          onClick={handleClearCache}
          style={{ marginTop: '20px', padding: '10px 20px' }}
        >
          Clear Cache
        </button>

        {isInstalled && (
          <p style={{ color: '#4CAF50', marginTop: '20px' }}>
            App is installed as a Progressive Web Application!
          </p>
        )}
      </header>
    </div>
  );
}

export default PWATest;