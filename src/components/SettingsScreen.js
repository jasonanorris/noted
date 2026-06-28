import { useEffect, useState } from 'react';
import { knowledgeDB } from '../db';
import useScreenFocus from '../hooks/useScreenFocus';

const STORAGE_ESTIMATE_CACHE_KEY = 'noted:storage-estimate';
const LAST_EXPORT_CACHE_KEY = 'noted:last-exported-at';
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

function readLastExportedAt() {
  try {
    return window.localStorage.getItem(LAST_EXPORT_CACHE_KEY) || '';
  } catch (error) {
    return '';
  }
}

function cacheLastExportedAt(exportedAt) {
  try {
    window.localStorage.setItem(LAST_EXPORT_CACHE_KEY, exportedAt);
  } catch (error) {
    // Last export metadata should never block backup creation.
  }
}

function formatExportDate(value) {
  if (!value) return 'Never';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
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

function SettingsScreen({ onBack, onImport, onDebug, theme = 'light', onThemeChange }) {
  const headingRef = useScreenFocus();
  const [summary, setSummary] = useState({ documents: 0, categories: 0, tags: 0 });
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [hasLoadedSummary, setHasLoadedSummary] = useState(false);
  const [storageEstimate, setStorageEstimate] = useState(createInitialStorageEstimate);
  const [lastExportedAt, setLastExportedAt] = useState(readLastExportedAt);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedTagId, setSelectedTagId] = useState('');

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
      cacheLastExportedAt(backupData.exportedAt);
      setLastExportedAt(backupData.exportedAt);
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
      await loadSummary();
      setStatus('success');
      setMessage('Local data cleared.');
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || 'Local data could not be cleared.');
    }
  };

  const startAddingCategory = () => {
    setNewCategoryName('');
    setIsAddingCategory(true);
  };

  const cancelAddingCategory = () => {
    setNewCategoryName('');
    setIsAddingCategory(false);
  };

  const addCategory = async (event) => {
    event.preventDefault();

    const trimmedName = newCategoryName.trim();
    if (!trimmedName) return;

    try {
      setStatus('working');
      setMessage('Adding category...');
      await knowledgeDB.createCategory(trimmedName);
      await loadSummary();
      setNewCategoryName('');
      setIsAddingCategory(false);
      setStatus('success');
      setMessage('Category added.');
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || 'Category could not be added.');
    }
  };

  const startAddingTag = () => {
    setNewTagName('');
    setIsAddingTag(true);
  };

  const cancelAddingTag = () => {
    setNewTagName('');
    setIsAddingTag(false);
  };

  const addTag = async (event) => {
    event.preventDefault();

    const trimmedName = newTagName.trim();
    if (!trimmedName) return;

    try {
      setStatus('working');
      setMessage('Adding tag...');
      await knowledgeDB.createTag(trimmedName);
      await loadSummary();
      setNewTagName('');
      setIsAddingTag(false);
      setStatus('success');
      setMessage('Tag added.');
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || 'Tag could not be added.');
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
      setSelectedCategoryId(category.id);
      setStatus('success');
      setMessage('Category renamed.');
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || 'Category could not be renamed.');
    }
  };

  const deleteCategory = async (category) => {
    const confirmed = window.confirm(`Delete "${category.name}" and move its notes to Unfiled?`);
    if (!confirmed) return;

    try {
      setStatus('working');
      setMessage('Deleting category...');
      await knowledgeDB.deleteCategory(category.id);
      await loadSummary();
      setSelectedCategoryId('');
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
      setSelectedTagId(tag.id);
      setStatus('success');
      setMessage('Tag renamed.');
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || 'Tag could not be renamed.');
    }
  };

  const deleteTag = async (tag) => {
    const confirmed = window.confirm(`Remove "${tag.name}" from all notes?`);
    if (!confirmed) return;

    try {
      setStatus('working');
      setMessage('Deleting tag...');
      await knowledgeDB.deleteTag(tag.id);
      await loadSummary();
      setSelectedTagId('');
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

      <section className="utility-panel settings-panel" aria-label="App settings">
        <section className="settings-group information-section" aria-labelledby="information-title">
          <h2 id="information-title">Information</h2>
          <div className="management-list">
            <div className="management-row">
              <span>
                <strong>Local Storage</strong>
                <small>{isLoading ? 'Loading storage summary...' : `${summary.documents} notes, ${summary.categories} categories, ${summary.tags} tags`}</small>
              </span>
            </div>
            <div className="management-row theme-info-row">
              <span>
                <strong>Theme</strong>
              </span>
              <div className="theme-toggle" role="group" aria-label="Color mode">
                <button
                  className={`segmented-button ${theme === 'light' ? 'is-active' : ''}`}
                  type="button"
                  onClick={() => onThemeChange?.('light')}
                  aria-pressed={theme === 'light'}
                >
                  Light
                </button>
                <button
                  className={`segmented-button ${theme === 'dark' ? 'is-active' : ''}`}
                  type="button"
                  onClick={() => onThemeChange?.('dark')}
                  aria-pressed={theme === 'dark'}
                >
                  Dark
                </button>
              </div>
            </div>
            <div className="management-row">
              <span>
                <strong>Storage Usage</strong>
                {storageEstimate.status === 'loading' && (
                  <small>Estimating storage...</small>
                )}
                {storageEstimate.status === 'ready' && (
                  <small>{formatStorageSize(storageEstimate.usage)} used of {formatStorageSize(storageEstimate.quota)}</small>
                )}
                {storageEstimate.status === 'unavailable' && (
                  <small>{storageEstimate.message}</small>
                )}
              </span>
              {storageEstimate.status === 'ready'
                && Number.isFinite(storageEstimate.usage)
                && Number.isFinite(storageEstimate.quota)
                && storageEstimate.quota > 0 && (
                  <span>{Math.round((storageEstimate.usage / storageEstimate.quota) * 100)}%</span>
              )}
            </div>
          </div>
          {storageEstimate.status === 'ready' && storageEstimate.message && (
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

        <button className="btn btn-primary settings-debug-link" type="button" onClick={onDebug}>
          Debug
        </button>

        <section className="settings-group backup-section" aria-labelledby="backup-guidance-title">
          <h2 id="backup-guidance-title">Back Up Local Notes</h2>
          <p>
            Notes are stored in this browser on this device. Export a JSON backup before clearing data,
            switching browsers, or moving to another device.
          </p>
          <div className="settings-action-list">
            <button
              className="settings-action-row"
              type="button"
              onClick={handleExport}
              disabled={isBusy}
              aria-label={isWorking ? 'Working' : 'Export JSON'}
            >
              {isWorking ? 'Working...' : 'Export'}
            </button>
            <button
              className="settings-action-row"
              type="button"
              onClick={onImport}
              disabled={isBusy}
              aria-label="Import JSON"
            >
              Import
            </button>
            <button
              className="settings-action-row is-danger"
              type="button"
              onClick={handleClear}
              disabled={isBusy}
              aria-label="Clear Local Data"
            >
              Clear
            </button>
            <p className="last-exported">Last Exported {formatExportDate(lastExportedAt)}</p>
          </div>
        </section>

        <div className="management-grid settings-group" aria-busy={isBusy}>
          <section className="settings-subgroup" aria-labelledby="category-management-title">
            <div className="management-section-header">
              <h2 id="category-management-title">Categories</h2>
              <button
                className="icon-button"
                type="button"
                aria-label="Add category"
                onClick={startAddingCategory}
                disabled={isBusy || isAddingCategory}
              >
                +
              </button>
            </div>
            {isAddingCategory && (
              <form className="management-add-form" onSubmit={addCategory}>
                <label className="sr-only" htmlFor="new-category-name">Category name</label>
                <input
                  id="new-category-name"
                  className="input"
                  type="text"
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder="Category name"
                  autoFocus
                  disabled={isBusy}
                />
                <button className="btn btn-primary" type="submit" disabled={isBusy || !newCategoryName.trim()}>
                  Add
                </button>
                <button className="btn btn-secondary" type="button" onClick={cancelAddingCategory} disabled={isBusy}>
                  Cancel
                </button>
              </form>
            )}
            <div className="management-list">
              {categories.length ? categories.map((category) => (
                <div
                  className={`management-row management-select-row ${selectedCategoryId === category.id ? 'is-selected' : ''}`}
                  key={category.id}
                  role="button"
                  tabIndex="0"
                  onClick={() => setSelectedCategoryId((currentId) => (currentId === category.id ? '' : category.id))}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    setSelectedCategoryId((currentId) => (currentId === category.id ? '' : category.id));
                  }}
                  aria-expanded={selectedCategoryId === category.id}
                >
                  <span>
                    <strong>{category.name}</strong>
                    <small>{category.count || 0} notes</small>
                  </span>
                  {selectedCategoryId === category.id && (
                    <span className="management-actions">
                      <button className="text-button" type="button" onClick={(event) => { event.stopPropagation(); renameCategory(category); }} disabled={isBusy}>
                        Rename
                      </button>
                      <button className="text-button is-danger" type="button" onClick={(event) => { event.stopPropagation(); deleteCategory(category); }} disabled={isBusy}>
                        Delete
                      </button>
                    </span>
                  )}
                </div>
              )) : (
                <p>No categories yet.</p>
              )}
            </div>
          </section>

          <section className="settings-subgroup" aria-labelledby="tag-management-title">
            <div className="management-section-header">
              <h2 id="tag-management-title">Tags</h2>
              <button
                className="icon-button"
                type="button"
                aria-label="Add tag"
                onClick={startAddingTag}
                disabled={isBusy || isAddingTag}
              >
                +
              </button>
            </div>
            {isAddingTag && (
              <form className="management-add-form" onSubmit={addTag}>
                <label className="sr-only" htmlFor="new-tag-name">Tag name</label>
                <input
                  id="new-tag-name"
                  className="input"
                  type="text"
                  value={newTagName}
                  onChange={(event) => setNewTagName(event.target.value)}
                  placeholder="Tag name"
                  autoFocus
                  disabled={isBusy}
                />
                <button className="btn btn-primary" type="submit" disabled={isBusy || !newTagName.trim()}>
                  Add
                </button>
                <button className="btn btn-secondary" type="button" onClick={cancelAddingTag} disabled={isBusy}>
                  Cancel
                </button>
              </form>
            )}
            <div className="management-list">
              {tags.length ? tags.map((tag) => (
                <div
                  className={`management-row management-select-row ${selectedTagId === tag.id ? 'is-selected' : ''}`}
                  key={tag.id}
                  role="button"
                  tabIndex="0"
                  onClick={() => setSelectedTagId((currentId) => (currentId === tag.id ? '' : tag.id))}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    setSelectedTagId((currentId) => (currentId === tag.id ? '' : tag.id));
                  }}
                  aria-expanded={selectedTagId === tag.id}
                >
                  <span>
                    <strong>{tag.name}</strong>
                    <small>{tag.count || 0} notes</small>
                  </span>
                  {selectedTagId === tag.id && (
                    <span className="management-actions">
                      <button className="text-button" type="button" onClick={(event) => { event.stopPropagation(); renameTag(tag); }} disabled={isBusy}>
                        Rename
                      </button>
                      <button className="text-button is-danger" type="button" onClick={(event) => { event.stopPropagation(); deleteTag(tag); }} disabled={isBusy}>
                        Delete
                      </button>
                    </span>
                  )}
                </div>
              )) : (
                <p>No tags yet.</p>
              )}
            </div>
          </section>
        </div>

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
