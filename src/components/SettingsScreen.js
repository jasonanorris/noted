import { useEffect, useState } from 'react';
import { knowledgeDB } from '../db';

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
  const [summary, setSummary] = useState({ documents: 0, categories: 0, tags: 0 });
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadSummary() {
      try {
        const [documents, categories, tags] = await Promise.all([
          knowledgeDB.getAllDocuments(),
          knowledgeDB.getAllCategories(),
          knowledgeDB.getAllTags(),
        ]);

        if (isMounted) {
          setSummary({
            documents: documents.length,
            categories: categories.length,
            tags: tags.length,
          });
        }
      } catch (error) {
        if (isMounted) {
          setMessage(error?.message || 'Storage summary could not be loaded.');
        }
      }
    }

    loadSummary();
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
      setStatus('success');
      setMessage('Local data cleared.');
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || 'Local data could not be cleared.');
    }
  };

  return (
    <main className="app-view">
      <header className="app-view-header">
        <button className="text-button" type="button" onClick={onBack}>
          Back
        </button>
        <h1>Settings</h1>
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
