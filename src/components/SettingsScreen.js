import { useEffect, useState } from 'react';
import { knowledgeDB } from '../db';
import useScreenFocus from '../hooks/useScreenFocus';

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

function SettingsScreen({ onBack }) {
  const headingRef = useScreenFocus();
  const [summary, setSummary] = useState({ documents: 0, categories: 0, tags: 0 });
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  const loadSummary = async ({ mounted = true } = {}) => {
    try {
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
      }
    } catch (error) {
      if (mounted) {
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

  return (
    <main className="app-view">
      <header className="app-view-header">
        <button className="text-button" type="button" onClick={onBack}>
          Back
        </button>
        <h1 ref={headingRef} tabIndex="-1">Settings</h1>
      </header>

      <section className="utility-panel" aria-label="App settings">
        <div>
          <h2>Local Storage</h2>
          <p>{summary.documents} documents, {summary.categories} categories, {summary.tags} tags</p>
        </div>

        <div className="utility-actions">
          <button className="btn btn-primary" type="button" onClick={handleExport}>
            Export JSON
          </button>
          <button className="btn btn-secondary" type="button" onClick={handleClear}>
            Clear Local Data
          </button>
        </div>

        <div className="management-grid">
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
                    <button className="text-button" type="button" onClick={() => renameCategory(category)}>
                      Rename
                    </button>
                    <button className="text-button is-danger" type="button" onClick={() => deleteCategory(category)}>
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
                    <button className="text-button" type="button" onClick={() => renameTag(tag)}>
                      Rename
                    </button>
                    <button className="text-button is-danger" type="button" onClick={() => deleteTag(tag)}>
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

        {message && (
          <p className={`form-status ${status === 'error' ? 'is-error' : ''}`} role={status === 'error' ? 'alert' : 'status'}>
            {message}
          </p>
        )}
      </section>
    </main>
  );
}

export default SettingsScreen;
