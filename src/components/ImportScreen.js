import { useState } from 'react';
import { knowledgeDB } from '../db';
import useScreenFocus from '../hooks/useScreenFocus';

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (error) {
        reject(new Error('Selected file is not valid JSON.'));
      }
    };

    reader.onerror = () => reject(new Error('Selected file could not be read.'));
    reader.readAsText(file);
  });
}

function ImportScreen({ onBack }) {
  const headingRef = useScreenFocus();
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const isWorking = status === 'working';

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setStatus('working');
      setMessage('Restoring backup...');

      const backupData = await readJsonFile(file);
      await knowledgeDB.importData(backupData);

      setStatus('success');
      setMessage('Backup restored. Your notes have been refreshed.');
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || 'Backup could not be restored.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <main id="main-content" className="app-view" tabIndex="-1">
      <header className="app-view-header">
        <button className="text-button" type="button" onClick={onBack}>
          Back
        </button>
        <h1 ref={headingRef} tabIndex="-1">Import</h1>
      </header>

      <section className="utility-panel" aria-label="Import backup">
        <div>
          <h2>Restore JSON Backup</h2>
          <p>Select a Noted backup file to replace the local notes, categories, tags, and settings.</p>
        </div>

        <label className={`file-picker ${isWorking ? 'is-disabled' : ''}`} htmlFor="backup-file">
          <span>{isWorking ? 'Restoring Backup...' : 'Choose JSON File'}</span>
          <input
            id="backup-file"
            type="file"
            accept="application/json,.json"
            onChange={handleImport}
            disabled={isWorking}
          />
        </label>

        {message && (
          <p className={`form-status ${status === 'error' ? 'is-error' : ''}`} role={status === 'error' ? 'alert' : 'status'}>
            {message}
          </p>
        )}
      </section>
    </main>
  );
}

export default ImportScreen;
