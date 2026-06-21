import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { knowledgeDB } from '../db';
import { createPlainPreview } from '../textFormatting';
import useScreenFocus from '../hooks/useScreenFocus';

const AUTO_SAVE_DELAY = 900;

const formatActions = [
  { id: 'bold', label: 'Bold', marker: '**', type: 'wrap' },
  { id: 'italic', label: 'Italic', marker: '_', type: 'wrap' },
  { id: 'heading', label: 'Heading', marker: '## ', type: 'line' },
  { id: 'bullet', label: 'Bullet', marker: '- ', type: 'line' },
];

function createTagText(tags) {
  return Array.isArray(tags) ? tags.join(', ') : '';
}

function parseTags(value) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function renderInlineFormatting(value) {
  const parts = String(value).split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith('_') && part.endsWith('_')) {
      return <em key={`${part}-${index}`}>{part.slice(1, -1)}</em>;
    }

    return part;
  });
}

function renderPreviewBlocks(value) {
  const lines = value.split('\n');
  const blocks = [];
  let bullets = [];

  const flushBullets = () => {
    if (!bullets.length) return;

    blocks.push(
      <ul className="editor-preview-list" key={`list-${blocks.length}`}>
        {bullets.map((bullet, index) => (
          <li key={`${bullet}-${index}`}>{renderInlineFormatting(bullet)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };

  lines.forEach((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      flushBullets();
      return;
    }

    if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
      bullets.push(trimmedLine.slice(2));
      return;
    }

    flushBullets();

    if (trimmedLine.startsWith('## ')) {
      blocks.push(<h2 key={`heading-${blocks.length}`}>{renderInlineFormatting(trimmedLine.slice(3))}</h2>);
      return;
    }

    if (trimmedLine.startsWith('# ')) {
      blocks.push(<h2 key={`heading-${blocks.length}`}>{renderInlineFormatting(trimmedLine.slice(2))}</h2>);
      return;
    }

    blocks.push(<p key={`paragraph-${blocks.length}`}>{renderInlineFormatting(trimmedLine)}</p>);
  });

  flushBullets();

  return blocks;
}

function EditorScreen({ document, onBack, onSaved }) {
  const headingRef = useScreenFocus();
  const [currentDocument, setCurrentDocument] = useState(document || null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [tagText, setTagText] = useState('');
  const [editorMode, setEditorMode] = useState('edit');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const hasUserEdited = useRef(false);
  const autoSaveTimer = useRef(null);
  const contentInput = useRef(null);

  useEffect(() => {
    setCurrentDocument(document || null);
    setTitle(document?.title || '');
    setContent(document?.content || document?.preview || '');
    setCategory(document?.categoryName || document?.category || '');
    setTagText(createTagText(document?.tags || []));
    setEditorMode('edit');
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

  const previewBlocks = useMemo(() => renderPreviewBlocks(content), [content]);

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
      contentFormat: 'markdown',
      preview: createPlainPreview(content),
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

  const applyFormat = (action) => {
    const input = contentInput.current;
    const selectionStart = input?.selectionStart ?? content.length;
    const selectionEnd = input?.selectionEnd ?? content.length;
    const selectedText = content.slice(selectionStart, selectionEnd);
    let nextContent;
    let nextSelectionStart;
    let nextSelectionEnd;

    if (action.type === 'wrap') {
      const fallbackText = action.id === 'bold' ? 'bold text' : 'italic text';
      const innerText = selectedText || fallbackText;
      const replacement = `${action.marker}${innerText}${action.marker}`;

      nextContent = `${content.slice(0, selectionStart)}${replacement}${content.slice(selectionEnd)}`;
      nextSelectionStart = selectionStart + action.marker.length;
      nextSelectionEnd = nextSelectionStart + innerText.length;
    } else {
      const lineStart = content.lastIndexOf('\n', Math.max(selectionStart - 1, 0)) + 1;
      const lineAlreadyMarked = content.slice(lineStart, lineStart + action.marker.length) === action.marker;

      if (lineAlreadyMarked) {
        nextContent = content;
        nextSelectionStart = selectionStart;
        nextSelectionEnd = selectionEnd;
      } else {
        nextContent = `${content.slice(0, lineStart)}${action.marker}${content.slice(lineStart)}`;
        nextSelectionStart = selectionStart + action.marker.length;
        nextSelectionEnd = selectionEnd + action.marker.length;
      }
    }

    markEdited(setContent)(nextContent);

    window.requestAnimationFrame(() => {
      contentInput.current?.focus();
      contentInput.current?.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    });
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
        <h1 ref={headingRef} tabIndex="-1">{document?.id ? 'Edit Document' : 'New Document'}</h1>
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

        <div className="field editor-content-field">
          <div className="editor-content-heading">
            <label htmlFor="editor-content">Content</label>
            <div className="segmented-control" aria-label="Editor mode">
              <button
                className={`segmented-button ${editorMode === 'edit' ? 'is-active' : ''}`}
                type="button"
                onClick={() => setEditorMode('edit')}
                aria-pressed={editorMode === 'edit'}
              >
                Edit
              </button>
              <button
                className={`segmented-button ${editorMode === 'preview' ? 'is-active' : ''}`}
                type="button"
                onClick={() => setEditorMode('preview')}
                aria-pressed={editorMode === 'preview'}
              >
                Preview
              </button>
            </div>
          </div>

          {editorMode === 'edit' ? (
            <>
              <div className="format-toolbar" aria-label="Formatting controls">
                {formatActions.map((action) => (
                  <button
                    className="format-button"
                    type="button"
                    key={action.id}
                    onClick={() => applyFormat(action)}
                    title={action.label}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              <textarea
                id="editor-content"
                ref={contentInput}
                className="input editor-content"
                value={content}
                onChange={(event) => markEdited(setContent)(event.target.value)}
                placeholder="Start writing..."
              />
            </>
          ) : (
            <div className="editor-preview" aria-label="Document preview">
              {previewBlocks.length ? previewBlocks : (
                <div className="document-state">
                  <strong>No preview yet</strong>
                  <span>Switch to edit mode and add note content.</span>
                </div>
              )}
            </div>
          )}
        </div>

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
