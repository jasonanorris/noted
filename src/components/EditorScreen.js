import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { knowledgeDB } from '../db';

const AUTO_SAVE_DELAY = 900;

function createTagText(tags) {
  return Array.isArray(tags) ? tags.join(', ') : '';
}

function parseTags(value) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function EditorScreen({ document, onBack, onSaved }) {
  const [currentDocument, setCurrentDocument] = useState(document || null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [tagText, setTagText] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const hasUserEdited = useRef(false);
  const autoSaveTimer = useRef(null);

  useEffect(() => {
    setCurrentDocument(document || null);
    setTitle(document?.title || '');
    setContent(document?.content || document?.preview || '');
    setCategory(document?.categoryName || document?.category || '');
    setTagText(createTagText(document?.tags || []));
    setStatus('idle');
    setError('');
    hasUserEdited.current = false;
  }, [document]);

  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
    };
  }, []);

  const canSave = useMemo(() => {
    return title.trim().length > 0 || content.trim().length > 0;
  }, [content, title]);

  const saveDocument = useCallback(async ({ auto = false } = {}) => {
    if (!canSave) {
      if (!auto) setError('Add a title or note content before saving.');
      return null;
    }

    if (!auto && autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }

    if (auto && (status === 'saving' || !hasUserEdited.current)) {
      return null;
    }

    const updates = {
      title: title.trim() || 'Untitled document',
      content: content.trim(),
      preview: content.trim(),
      category: category.trim() || 'Unfiled',
      categoryName: category.trim() || 'Unfiled',
      tags: parseTags(tagText),
    };

    try {
      setStatus('saving');
      setError('');

      if (currentDocument?.id) {
        const savedDocument = await knowledgeDB.updateDocument(currentDocument.id, updates);
        setCurrentDocument(savedDocument);
        onSaved(savedDocument);
        hasUserEdited.current = false;
        setStatus(auto ? 'autosaved' : 'saved');
        return savedDocument;
      } else {
        const savedDocument = await knowledgeDB.createDocument({ ...updates });
        setCurrentDocument(savedDocument);
        onSaved(savedDocument);
        hasUserEdited.current = false;
        setStatus(auto ? 'autosaved' : 'saved');
        return savedDocument;
      }
    } catch (saveError) {
      setStatus('error');
      setError(saveError?.message || 'Document could not be saved.');
      return null;
    }
  }, [canSave, category, content, currentDocument, onSaved, status, tagText, title]);

  useEffect(() => {
    if (!hasUserEdited.current || !canSave) return undefined;

    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }

    autoSaveTimer.current = setTimeout(() => {
      saveDocument({ auto: true });
    }, AUTO_SAVE_DELAY);

    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
    };
  }, [canSave, category, content, saveDocument, tagText, title]);

  const markEdited = (setter) => (value) => {
    hasUserEdited.current = true;
    if (status === 'saved' || status === 'autosaved') {
      setStatus('idle');
    }
    setter(value);
  };

  const handleDelete = async () => {
    if (!currentDocument?.id) return;
    const confirmed = window.confirm('Delete this document? This cannot be undone.');
    if (!confirmed) return;

    try {
      setStatus('saving');
      setError('');
      await knowledgeDB.deleteDocument(currentDocument.id);
      onSaved(null);
      onBack();
    } catch (deleteError) {
      setStatus('error');
      setError(deleteError?.message || 'Document could not be deleted.');
    }
  };

  return (
    <main className="app-view editor-view">
      <header className="app-view-header">
        <button className="text-button" type="button" onClick={onBack}>
          Back
        </button>
        <h1>{document?.id ? 'Edit Document' : 'New Document'}</h1>
      </header>

      <section className="editor-shell" aria-label="Document editor">
        <label className="field">
          <span>Title</span>
          <input
            className="input"
            value={title}
            onChange={(event) => markEdited(setTitle)(event.target.value)}
            placeholder="Untitled document"
          />
        </label>

        <label className="field">
          <span>Category</span>
          <input
            className="input"
            value={category}
            onChange={(event) => markEdited(setCategory)(event.target.value)}
            placeholder="Unfiled"
          />
        </label>

        <label className="field">
          <span>Tags</span>
          <input
            className="input"
            value={tagText}
            onChange={(event) => markEdited(setTagText)(event.target.value)}
            placeholder="ideas, project, reference"
          />
        </label>

        <label className="field editor-content-field">
          <span>Content</span>
          <textarea
            className="input editor-content"
            value={content}
            onChange={(event) => markEdited(setContent)(event.target.value)}
            placeholder="Start writing..."
          />
        </label>

        {error && (
          <p className="form-status is-error" role="alert">
            {error}
          </p>
        )}

        <div className="editor-actions">
          <span className="form-status" role={status === 'saving' ? 'status' : undefined}>
            {status === 'saving' && 'Saving...'}
            {status === 'saved' && 'Saved'}
            {status === 'autosaved' && 'Auto-saved'}
          </span>
          <div className="editor-button-group">
            {currentDocument?.id && (
              <button className="btn btn-danger" type="button" onClick={handleDelete}>
                Delete
              </button>
            )}
            <button className="btn btn-primary" type="button" onClick={() => saveDocument()}>
              Save
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default EditorScreen;
