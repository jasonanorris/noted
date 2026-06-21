import { useEffect, useState } from 'react';
import { knowledgeDB } from '../db';
import {
  formatPerformanceMetric,
  getPerformanceMetrics,
  summarizePerformanceMetrics,
} from '../performanceMonitoring';
import useScreenFocus from '../hooks/useScreenFocus';

const STORAGE_ESTIMATE_CACHE_KEY = 'noted:storage-estimate';
const STORAGE_ESTIMATE_TIMEOUT = 2000;

function downloadJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `noted-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatStorageSize(bytes) {
  if (!Number.isFinite(bytes)) return 'Unknown';

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function readCachedStorageEstimate() {
  try {
    const cachedEstimate = JSON.parse(window.localStorage.getItem(STORAGE_ESTIMATE_CACHE_KEY) || 'null');

    if (!cachedEstimate || !Number.isFinite(cachedEstimate.usage) || !Number.isFinite(cachedEstimate.quota)) {
      return null;
    }

    return cachedEstimate;
  } catch (error) {
    return null;
  }
}

function cacheStorageEstimate(estimate) {
  if (!Number.isFinite(estimate?.usage) || !Number.isFinite(estimate?.quota)) return;

  try {
    window.localStorage.setItem(STORAGE_ESTIMATE_CACHE_KEY, JSON.stringify({
      usage: estimate.usage,
      quota: estimate.quota,
      capturedAt: Date.now(),
    }));
  } catch (error) {
    // Storage estimates are useful but not critical.
  }
}

function createInitialStorageEstimate() {
  const cachedEstimate = readCachedStorageEstimate();

  if (!cachedEstimate) {
    return {
      status: 'loading',
      usage: null,
      quota: null,
      message: '',
    };
  }

  return {
    status: 'ready',
    usage: cachedEstimate.usage,
    quota: cachedEstimate.quota,
    message: 'Showing the latest saved storage estimate.',
  };
}

function estimateStorageWithTimeout() {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('Storage estimate timed out.'));
    }, STORAGE_ESTIMATE_TIMEOUT);

    navigator.storage.estimate()
      .then((estimate) => {
        window.clearTimeout(timeoutId);
        resolve(estimate);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function SettingsScreen({ onBack }) {
  const headingRef = useScreenFocus();
  const [summary, setSummary] = useState({ documents: 0, categories: 0, tags: 0 });
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [hasLoadedSummary, setHasLoadedSummary] = useState(false);
  const [performanceMetrics, setPerformanceMetrics] = useState(() => summarizePerformanceMetrics());
  const [storageEstimate, setStorageEstimate] = useState(createInitialStorageEstimate);

  const loadSummary = async ({ mounted = true } = {}) => {
    try {
      if (mounted) {
        setStatus((currentStatus) => (currentStatus === 'working' ? currentStatus : 'loading'));
        setMessage('');
      }

      const [documents, storedCategories, storedTags] = await Promise.all([
        knowledgeDB.getAllDocuments(),
        knowledgeDB.getAllCategories(),
        knowledgeDB.getAllTags(),
      ]);

      if (mounted) {
        setSummary({
          documents: documents.length,
          categories: storedCategories.length,
          tags: storedTags.length,
        });
        setCategories(storedCategories);
        setTags(storedTags);
        setHasLoadedSummary(true);
        setStatus('ready');
      }
    } catch (error) {
      if (mounted) {
        setStatus('error');
        setMessage(error?.message || 'Storage summary could not be loaded.');
      }
    }
  };

  useEffect(() => {
    let isMounted = true;

    loadSummary({ mounted: isMounted });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const refreshPerformanceMetrics = () => {
      setPerformanceMetrics(summarizePerformanceMetrics(getPerformanceMetrics()));
    };

    window.addEventListener('performance:metric', refreshPerformanceMetrics);
    return () => window.removeEventListener('performance:metric', refreshPerformanceMetrics);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadStorageEstimate() {
      if (!navigator.storage?.estimate) {
        if (isMounted) {
          setStorageEstimate((currentEstimate) => {
            if (currentEstimate.status === 'ready') {
              return {
                ...currentEstimate,
                message: 'Showing the latest saved estimate because fresh storage estimates are not available in this browser.',
              };
            }

            return {
              status: 'unavailable',
              usage: null,
              quota: null,
              message: 'Storage estimates are not available in this browser.',
            };
          });
        }
        return;
      }

      try {
        const estimate = await estimateStorageWithTimeout();
        cacheStorageEstimate(estimate);

        if (isMounted) {
          setStorageEstimate({
            status: 'ready',
            usage: estimate.usage,
            quota: estimate.quota,
            message: '',
          });
        }
      } catch (error) {
        if (isMounted) {
          setStorageEstimate((currentEstimate) => {
            if (currentEstimate.status === 'ready') {
              return {
                ...currentEstimate,
                message: 'Showing the latest saved estimate because storage usage could not be refreshed.',
              };
            }

            return {
              status: 'unavailable',
              usage: null,
              quota: null,
              message: 'Storage usage could not be estimated.',
            };
          });
        }
      }
    }

    loadStorageEstimate();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleExport = async () => {
    try {
      setStatus('working');
      setMessage('Preparing backup...');
      const backupData = await knowledgeDB.exportData();
      downloadJson(backupData);
      setStatus('success');
      setMessage('Backup downloaded.');
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || 'Backup could not be exported.');
    }
  };

  const handleClear = async () => {
    const confirmed = window.confirm('Clear all local data? Export a backup first if you want to keep your notes.');
    if (!confirmed) return;

    try {
      setStatus('working');
      setMessage('Clearing local data...');
      await knowledgeDB.clearAllData();
      setSummary({ documents: 0, categories: 0, tags: 0 });
      setCategories([]);
      setTags([]);
      setStatus('success');
      setMessage('Local data cleared.');
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || 'Local data could not be cleared.');
    }
  };

  const renameCategory = async (category) => {
    const nextName = window.prompt('Rename category', category.name);
    if (nextName === null || nextName.trim() === category.name) return;

    try {
      setStatus('working');
      setMessage('Renaming category...');
      await knowledgeDB.renameCategory(category.id, nextName);
      await loadSummary();
      setStatus('success');
      setMessage('Category renamed.');
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || 'Category could not be renamed.');
    }
  };

  const deleteCategory = async (category) => {
    const confirmed = window.confirm(`Move documents in "${category.name}" to Unfiled?`);
    if (!confirmed) return;

    try {
      setStatus('working');
      setMessage('Deleting category...');
      await knowledgeDB.deleteCategory(category.id);
      await loadSummary();
      setStatus('success');
      setMessage('Category deleted.');
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || 'Category could not be deleted.');
    }
  };

  const renameTag = async (tag) => {
    const nextName = window.prompt('Rename tag', tag.name);
    if (nextName === null || nextName.trim() === tag.name) return;

    try {
      setStatus('working');
      setMessage('Renaming tag...');
      await knowledgeDB.renameTag(tag.id, nextName);
      await loadSummary();
      setStatus('success');
      setMessage('Tag renamed.');
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || 'Tag could not be renamed.');
    }
  };

  const deleteTag = async (tag) => {
    const confirmed = window.confirm(`Remove "${tag.name}" from all documents?`);
    if (!confirmed) return;

    try {
      setStatus('working');
      setMessage('Deleting tag...');
      await knowledgeDB.deleteTag(tag.id);
      await loadSummary();
      setStatus('success');
      setMessage('Tag deleted.');
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || 'Tag could not be deleted.');
    }
  };

  const isLoading = status === 'loading';
  const isWorking = status === 'working';
  const isBusy = isLoading || isWorking;
  const hasLoadError = status === 'error' && !hasLoadedSummary;

  return (
    <main id="main-content" className="app-view" tabIndex="-1">
      <header className="app-view-header">
        <button className="text-button" type="button" onClick={onBack}>
          Back
        </button>
        <h1 ref={headingRef} tabIndex="-1">Settings</h1>
      </header>

      <section className="utility-panel" aria-label="App settings">
        <div>
          <h2>Local Storage</h2>
          <p>{isLoading ? 'Loading storage summary...' : `${summary.documents} documents, ${summary.categories} categories, ${summary.tags} tags`}</p>
        </div>

        <section aria-labelledby="storage-usage-title">
          <h2 id="storage-usage-title">Storage Usage</h2>
          {storageEstimate.status === 'loading' && (
            <div className="document-state" role="status">
              <span className="spinner" aria-hidden="true"></span>
              <span>Estimating storage...</span>
            </div>
          )}
          {storageEstimate.status === 'ready' && (
            <>
              <div className="management-row">
                <span>
                  <strong>{formatStorageSize(storageEstimate.usage)} used</strong>
                  <small>{formatStorageSize(storageEstimate.quota)} available to this browser profile</small>
                </span>
                {Number.isFinite(storageEstimate.usage) && Number.isFinite(storageEstimate.quota) && storageEstimate.quota > 0 && (
                  <span>{Math.round((storageEstimate.usage / storageEstimate.quota) * 100)}%</span>
                )}
              </div>
              {storageEstimate.message && (
                <p>{storageEstimate.message}</p>
              )}
            </>
          )}
          {storageEstimate.status === 'unavailable' && (
            <p>{storageEstimate.message}</p>
          )}
        </section>

        {isLoading && (
          <div className="document-state" role="status">
            <span className="spinner" aria-hidden="true"></span>
            <span>Loading settings...</span>
          </div>
        )}

        {hasLoadError && message && (
          <div className="document-state is-error" role="alert">
            <strong>Settings could not load.</strong>
            <span>{message}</span>
          </div>
        )}

        <div className="utility-actions">
          <button className="btn btn-primary" type="button" onClick={handleExport} disabled={isBusy}>
            {isWorking ? 'Working...' : 'Export JSON'}
          </button>
          <button className="btn btn-secondary" type="button" onClick={handleClear} disabled={isBusy}>
            Clear Local Data
          </button>
        </div>

        <div className="management-grid" aria-busy={isBusy}>
          <section aria-labelledby="category-management-title">
            <h2 id="category-management-title">Categories</h2>
            <div className="management-list">
              {categories.length ? categories.map((category) => (
                <div className="management-row" key={category.id}>
                  <span>
                    <strong>{category.name}</strong>
                    <small>{category.count || 0} documents</small>
                  </span>
                  <span className="management-actions">
                    <button className="text-button" type="button" onClick={() => renameCategory(category)} disabled={isBusy}>
                      Rename
                    </button>
                    <button className="text-button is-danger" type="button" onClick={() => deleteCategory(category)} disabled={isBusy}>
                      Delete
                    </button>
                  </span>
                </div>
              )) : (
                <p>No categories yet.</p>
              )}
            </div>
          </section>

          <section aria-labelledby="tag-management-title">
            <h2 id="tag-management-title">Tags</h2>
            <div className="management-list">
              {tags.length ? tags.map((tag) => (
                <div className="management-row" key={tag.id}>
                  <span>
                    <strong>{tag.name}</strong>
                    <small>{tag.count || 0} documents</small>
                  </span>
                  <span className="management-actions">
                    <button className="text-button" type="button" onClick={() => renameTag(tag)} disabled={isBusy}>
                      Rename
                    </button>
                    <button className="text-button is-danger" type="button" onClick={() => deleteTag(tag)} disabled={isBusy}>
                      Delete
                    </button>
                  </span>
                </div>
              )) : (
                <p>No tags yet.</p>
              )}
            </div>
          </section>
        </div>

        <section aria-labelledby="performance-monitoring-title">
          <h2 id="performance-monitoring-title">Performance</h2>
          {performanceMetrics.length ? (
            <div className="management-list">
              {performanceMetrics.map((metric) => (
                <div className="management-row" key={metric.name}>
                  <span>
                    <strong>{metric.name}</strong>
                    <small>{metric.rating}</small>
                  </span>
                  <span>{formatPerformanceMetric(metric)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p>No performance metrics yet.</p>
          )}
        </section>

        {message && !hasLoadError && (
          <p className={`form-status ${status === 'error' ? 'is-error' : ''}`} role={status === 'error' ? 'alert' : 'status'}>
            {message}
          </p>
        )}
      </section>
    </main>
  );
}

export default SettingsScreen;
