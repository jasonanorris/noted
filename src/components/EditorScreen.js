import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { knowledgeDB } from '../db';
import { createPlainPreview } from '../textFormatting';
import useScreenFocus from '../hooks/useScreenFocus';

const MIN_SAVE_STATUS_MS = 500;
const SAVE_SUCCESS_STATUS_MS = 1400;
const HISTORY_LIMIT = 100;

const formatActions = [
  { id: 'bold', label: 'Bold', marker: '**', type: 'wrap' },
  { id: 'italic', label: 'Italic', marker: '_', type: 'wrap' },
  { id: 'heading', label: 'Heading', marker: '## ', type: 'line' },
  { id: 'bullet', label: 'Bullet', marker: '- ', type: 'line' },
];

const EMPTY_CHECKLIST_ITEM = { checked: false, text: '' };

function createTagText(tags) {
  return Array.isArray(tags) ? tags.join(', ') : '';
}

function parseTags(value) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function getEditableCategory(document) {
  const categoryName = document?.categoryName || document?.category || '';

  return categoryName === 'Unfiled' ? '' : categoryName;
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
  let tasks = [];

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

  const flushTasks = () => {
    if (!tasks.length) return;

    blocks.push(
      <ul className="editor-preview-list editor-preview-checklist" key={`tasks-${blocks.length}`}>
        {tasks.map((task, index) => (
          <li key={`${task.text}-${index}`}>
            <input type="checkbox" checked={task.checked} readOnly tabIndex="-1" aria-hidden="true" />
            <span>{renderInlineFormatting(task.text)}</span>
          </li>
        ))}
      </ul>
    );
    tasks = [];
  };

  lines.forEach((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      flushBullets();
      flushTasks();
      return;
    }

    const taskMatch = trimmedLine.match(/^[-*]\s+\[([ xX])\]\s?(.*)$/);
    if (taskMatch) {
      flushBullets();
      tasks.push({ checked: taskMatch[1].toLowerCase() === 'x', text: taskMatch[2] });
      return;
    }

    if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
      flushTasks();
      bullets.push(trimmedLine.slice(2));
      return;
    }

    flushBullets();
    flushTasks();

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
  flushTasks();

  return blocks;
}

function parseChecklistItems(value) {
  if (!value.trim()) {
    return [{ ...EMPTY_CHECKLIST_ITEM }];
  }

  return value.split('\n').map((line) => {
    const taskMatch = line.trim().match(/^[-*]\s+\[([ xX])\]\s?(.*)$/);
    if (taskMatch) {
      return {
        checked: taskMatch[1].toLowerCase() === 'x',
        text: taskMatch[2],
      };
    }

    const bulletMatch = line.trim().match(/^[-*]\s+(.*)$/);
    return {
      checked: false,
      text: bulletMatch ? bulletMatch[1] : line,
    };
  });
}

function serializeChecklistItems(items) {
  return items
    .map((item) => `- [${item.checked ? 'x' : ' '}] ${item.text}`)
    .join('\n');
}

function EditorScreen({ document, onBack, onSaved }) {
  const headingRef = useScreenFocus();
  const [currentDocument, setCurrentDocument] = useState(document || null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [tagText, setTagText] = useState('');
  const [editorMode, setEditorMode] = useState('edit');
  const [status, setStatus] = useState('idle');
  const [saveStatusLabel, setSaveStatusLabel] = useState('');
  const [error, setError] = useState('');
  const statusTimer = useRef(null);
  const contentInput = useRef(null);
  const undoStack = useRef([]);
  const redoStack = useRef([]);

  useEffect(() => {
    setCurrentDocument(document || null);
    setTitle(document?.title || '');
    setContent(document?.content || document?.preview || '');
    setCategory(getEditableCategory(document));
    setTagText(createTagText(document?.tags || []));
    setEditorMode('edit');
    setStatus('idle');
    setSaveStatusLabel('');
    setError('');
    if (statusTimer.current) {
      clearTimeout(statusTimer.current);
      statusTimer.current = null;
    }
    undoStack.current = [];
    redoStack.current = [];
  }, [document]);

  useEffect(() => {
    return () => {
      if (statusTimer.current) {
        clearTimeout(statusTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadCategories() {
      try {
        const storedCategories = await knowledgeDB.getAllCategories();
        if (isMounted) {
          setCategoryOptions(
            [...storedCategories]
              .filter((category) => category.name !== 'Unfiled')
              .sort((first, second) => first.name.localeCompare(second.name))
          );
        }
      } catch (loadError) {
        if (isMounted) {
          setCategoryOptions([]);
        }
      }
    }

    loadCategories();

    const handleDocumentsChanged = () => loadCategories();
    window.addEventListener('documents:changed', handleDocumentsChanged);

    return () => {
      isMounted = false;
      window.removeEventListener('documents:changed', handleDocumentsChanged);
    };
  }, []);

  const canSave = useMemo(() => {
    return title.trim().length > 0 || content.trim().length > 0;
  }, [content, title]);

  const previewBlocks = useMemo(() => renderPreviewBlocks(content), [content]);
  const checklistItems = useMemo(() => parseChecklistItems(content), [content]);
  const selectedExistingCategory = categoryOptions.some((option) => option.name === category.trim());

  const finishSavingStatus = useCallback((nextStatus, startedAt) => {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(MIN_SAVE_STATUS_MS - elapsed, 0);

    if (statusTimer.current) {
      clearTimeout(statusTimer.current);
    }

    statusTimer.current = window.setTimeout(() => {
      setSaveStatusLabel('Saved');
      statusTimer.current = window.setTimeout(() => {
        setSaveStatusLabel('');
        statusTimer.current = null;
      }, SAVE_SUCCESS_STATUS_MS);
    }, remaining);
  }, []);

  const saveDocument = useCallback(async () => {
    if (!canSave) {
      setError('Add a title or note content before saving.');
      return null;
    }

    if (status === 'saving') {
      return null;
    }

    const updates = {
      title: title.trim() || 'Untitled note',
      content,
      contentFormat: 'markdown',
      preview: createPlainPreview(content),
      category: category.trim() || 'Unfiled',
      categoryName: category.trim() || 'Unfiled',
      tags: parseTags(tagText),
    };

    try {
      const saveStartedAt = Date.now();
      if (statusTimer.current) {
        clearTimeout(statusTimer.current);
        statusTimer.current = null;
      }
      setStatus('saving');
      setSaveStatusLabel('Saving...');
      setError('');

      if (currentDocument?.id) {
        const savedDocument = await knowledgeDB.updateDocument(currentDocument.id, updates);
        setCurrentDocument(savedDocument);
        onSaved(savedDocument);
        setStatus('saved');
        finishSavingStatus('saved', saveStartedAt);
        return savedDocument;
      } else {
        const savedDocument = await knowledgeDB.createDocument({ ...updates });
        setCurrentDocument(savedDocument);
        onSaved(savedDocument);
        setStatus('saved');
        finishSavingStatus('saved', saveStartedAt);
        return savedDocument;
      }
    } catch (saveError) {
      setStatus('error');
      setError(saveError?.message || 'Note could not be saved.');
      return null;
    }
  }, [canSave, category, content, currentDocument, finishSavingStatus, onSaved, status, tagText, title]);

  const markEdited = (setter) => (value) => {
    if (status === 'saved') {
      setStatus('idle');
    }
    setter(value);
  };

  const selectCategory = (categoryName) => {
    const nextCategory = category.trim() === categoryName ? '' : categoryName;
    markEdited(setCategory)(nextCategory);
  };

  const restoreContentSelection = (selectionStart, selectionEnd = selectionStart) => {
    if (selectionStart === undefined || selectionEnd === undefined) return;

    window.requestAnimationFrame(() => {
      contentInput.current?.focus();
      contentInput.current?.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const setEditedState = () => {
    if (status === 'saved') {
      setStatus('idle');
    }
  };

  const commitContentChange = (nextContent, selectionStart, selectionEnd = selectionStart) => {
    if (nextContent === content) {
      restoreContentSelection(selectionStart, selectionEnd);
      return;
    }

    setEditedState();
    undoStack.current = [...undoStack.current, content].slice(-HISTORY_LIMIT);
    redoStack.current = [];
    setContent(nextContent);
    restoreContentSelection(selectionStart, selectionEnd);
  };

  const undoContentChange = () => {
    const previousContent = undoStack.current.pop();
    if (previousContent === undefined) return;

    setEditedState();
    redoStack.current = [...redoStack.current, content].slice(-HISTORY_LIMIT);
    setContent(previousContent);
    restoreContentSelection(previousContent.length);
  };

  const redoContentChange = () => {
    const nextContent = redoStack.current.pop();
    if (nextContent === undefined) return;

    setEditedState();
    undoStack.current = [...undoStack.current, content].slice(-HISTORY_LIMIT);
    setContent(nextContent);
    restoreContentSelection(nextContent.length);
  };

  const handleContentKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const input = contentInput.current;
    const selectionStart = input?.selectionStart ?? content.length;
    const selectionEnd = input?.selectionEnd ?? selectionStart;
    const lineStart = content.lastIndexOf('\n', Math.max(selectionStart - 1, 0)) + 1;
    const lineEndIndex = content.indexOf('\n', selectionStart);
    const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
    const lineBeforeCursor = content.slice(lineStart, selectionStart);
    const lineAfterCursor = content.slice(selectionEnd, lineEnd);
    const bulletMatch = lineBeforeCursor.match(/^(\s*)([-*])\s/);

    if (!bulletMatch) return;

    event.preventDefault();

    const [, indentation, marker] = bulletMatch;
    const bulletPrefix = `${indentation}${marker} `;

    if (lineBeforeCursor === bulletPrefix && !lineAfterCursor.trim()) {
      const nextContent = `${content.slice(0, lineStart)}${content.slice(lineEnd)}`;
      commitContentChange(nextContent, lineStart);
      return;
    }

    const insertion = `\n${bulletPrefix}`;
    const nextContent = `${content.slice(0, selectionStart)}${insertion}${content.slice(selectionEnd)}`;
    const nextSelection = selectionStart + insertion.length;
    commitContentChange(nextContent, nextSelection);
  };

  const commitChecklistItems = (nextItems) => {
    commitContentChange(serializeChecklistItems(nextItems));
  };

  const updateChecklistItem = (index, updates) => {
    const nextItems = checklistItems.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...updates } : item
    ));

    commitChecklistItems(nextItems);
  };

  const addChecklistItem = (afterIndex = checklistItems.length - 1) => {
    const insertIndex = Math.max(0, afterIndex + 1);
    const nextItems = [
      ...checklistItems.slice(0, insertIndex),
      { ...EMPTY_CHECKLIST_ITEM },
      ...checklistItems.slice(insertIndex),
    ];

    commitChecklistItems(nextItems);

    window.requestAnimationFrame(() => {
      window.document.getElementById(`editor-checklist-item-${insertIndex}`)?.focus();
    });
  };

  const removeChecklistItem = (index) => {
    const nextItems = checklistItems.filter((_, itemIndex) => itemIndex !== index);
    commitChecklistItems(nextItems.length ? nextItems : [{ ...EMPTY_CHECKLIST_ITEM }]);

    window.requestAnimationFrame(() => {
      const focusIndex = Math.max(index - 1, 0);
      window.document.getElementById(`editor-checklist-item-${focusIndex}`)?.focus();
    });
  };

  const handleChecklistKeyDown = (event, index) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      addChecklistItem(index);
      return;
    }

    if (event.key === 'Backspace' && !event.currentTarget.value && checklistItems.length > 1) {
      event.preventDefault();
      removeChecklistItem(index);
    }
  };

  const applyFormat = (action) => {
    if (!action) return;

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

    commitContentChange(nextContent, nextSelectionStart, nextSelectionEnd);
  };

  const handleDelete = async () => {
    if (!currentDocument?.id) return;
    const confirmed = window.confirm('Delete this note? This cannot be undone.');
    if (!confirmed) return;

    try {
      setStatus('saving');
      setError('');
      await knowledgeDB.deleteDocument(currentDocument.id);
      onSaved(null);
      onBack();
    } catch (deleteError) {
      setStatus('error');
      setError(deleteError?.message || 'Note could not be deleted.');
    }
  };

  const handleEditorShortcut = (event) => {
    const isCommand = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const isContentTarget = event.target === contentInput.current || event.target.closest?.('.format-toolbar');

    if (isCommand && !event.altKey && key === 's') {
      event.preventDefault();
      saveDocument();
      return;
    }

    if (isContentTarget && isCommand && !event.altKey && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        redoContentChange();
      } else {
        undoContentChange();
      }
      return;
    }

    if (isContentTarget && isCommand && !event.altKey && key === 'y') {
      event.preventDefault();
      redoContentChange();
      return;
    }

    if (isContentTarget && isCommand && !event.altKey && key === 'b') {
      event.preventDefault();
      setEditorMode('edit');
      applyFormat(formatActions.find((action) => action.id === 'bold'));
      return;
    }

    if (isContentTarget && isCommand && !event.altKey && key === 'i') {
      event.preventDefault();
      setEditorMode('edit');
      applyFormat(formatActions.find((action) => action.id === 'italic'));
      return;
    }

    if (isCommand && event.shiftKey && !event.altKey && key === 'p') {
      event.preventDefault();
      setEditorMode((mode) => (mode === 'preview' ? 'edit' : 'preview'));
      return;
    }

    if (key === 'escape' && editorMode === 'preview') {
      event.preventDefault();
      setEditorMode('edit');
    }
  };

  useEffect(() => {
    if (editorMode !== 'preview') {
      return undefined;
    }

    const handlePreviewEscape = (event) => {
      if (event.defaultPrevented || event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      setEditorMode('edit');
    };

    window.addEventListener('keydown', handlePreviewEscape);

    return () => {
      window.removeEventListener('keydown', handlePreviewEscape);
    };
  }, [editorMode]);

  useEffect(() => {
    const handleSaveShortcut = (event) => {
      const key = event.key.toLowerCase();

      if (event.defaultPrevented || event.altKey || key !== 's' || (!event.ctrlKey && !event.metaKey)) {
        return;
      }

      event.preventDefault();
      saveDocument();
    };

    window.addEventListener('keydown', handleSaveShortcut);

    return () => {
      window.removeEventListener('keydown', handleSaveShortcut);
    };
  }, [saveDocument]);

  return (
    <main id="main-content" className="app-view editor-view" tabIndex="-1" onKeyDown={handleEditorShortcut}>
      <header className="app-view-header">
        <button className="text-button" type="button" onClick={onBack}>
          Back
        </button>
        <h1 ref={headingRef} tabIndex="-1">{document?.id ? 'Edit Note' : 'New Note'}</h1>
      </header>

      <section className="editor-shell" aria-label="Note editor">
        <label className="field editor-title-field">
          <span className="sr-only">Title</span>
          <input
            className="input editor-title-input"
            value={title}
            onChange={(event) => markEdited(setTitle)(event.target.value)}
            placeholder="Untitled note"
          />
        </label>
        <button
          className="btn btn-primary editor-header-save"
          type="button"
          onClick={() => saveDocument()}
          title="Save (Ctrl/Cmd+S)"
          aria-keyshortcuts="Control+S Meta+S"
        >
          Save
        </button>

        <div className="field editor-content-field">
          <div className="editor-content-heading">
            <label htmlFor={editorMode === 'checklist' ? 'editor-checklist-item-0' : 'editor-content'}>Content</label>
            <div className="segmented-control" aria-label="Editor mode">
              <button
                className={`segmented-button ${editorMode === 'edit' ? 'is-active' : ''}`}
                type="button"
                onClick={() => setEditorMode('edit')}
                aria-pressed={editorMode === 'edit'}
                title="Edit"
              >
                Edit
              </button>
              <button
                className={`segmented-button ${editorMode === 'preview' ? 'is-active' : ''}`}
                type="button"
                onClick={() => setEditorMode('preview')}
                aria-pressed={editorMode === 'preview'}
                title="Toggle preview (Ctrl/Cmd+Shift+P)"
                aria-keyshortcuts="Control+Shift+P Meta+Shift+P"
              >
                Preview
              </button>
              <button
                className={`segmented-button ${editorMode === 'checklist' ? 'is-active' : ''}`}
                type="button"
                onClick={() => setEditorMode('checklist')}
                aria-pressed={editorMode === 'checklist'}
                title="Checklist"
              >
                Checklist
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
                    aria-keyshortcuts={
                      action.id === 'bold'
                        ? 'Control+B Meta+B'
                        : action.id === 'italic'
                          ? 'Control+I Meta+I'
                          : undefined
                    }
                    title={
                      action.id === 'bold'
                        ? 'Bold (Ctrl/Cmd+B)'
                        : action.id === 'italic'
                          ? 'Italic (Ctrl/Cmd+I)'
                          : action.label
                    }
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
                onChange={(event) => commitContentChange(
                  event.target.value,
                  event.target.selectionStart,
                  event.target.selectionEnd
                )}
                onKeyDown={handleContentKeyDown}
                placeholder="Start writing..."
              />
            </>
          ) : editorMode === 'checklist' ? (
            <div className="editor-checklist" aria-label="Checklist editor">
              {checklistItems.map((item, index) => (
                <div className="editor-checklist-row" key={`checklist-item-${index}`}>
                  <input
                    className="editor-checklist-checkbox"
                    type="checkbox"
                    checked={item.checked}
                    onChange={(event) => updateChecklistItem(index, { checked: event.target.checked })}
                    aria-label={`Mark item ${index + 1} ${item.checked ? 'incomplete' : 'complete'}`}
                  />
                  <input
                    id={`editor-checklist-item-${index}`}
                    className="input editor-checklist-input"
                    value={item.text}
                    onChange={(event) => updateChecklistItem(index, { text: event.target.value })}
                    onKeyDown={(event) => handleChecklistKeyDown(event, index)}
                    placeholder={index === 0 ? 'Checklist item' : 'Next item'}
                  />
                </div>
              ))}
              <button className="text-button checklist-add-button" type="button" onClick={() => addChecklistItem()}>
                Add item
              </button>
            </div>
          ) : (
            <div className="editor-preview" aria-label="Note preview">
              {previewBlocks.length ? previewBlocks : (
                <div className="document-state">
                  <strong>No preview yet</strong>
                  <span>Switch to edit mode and add note content.</span>
                </div>
              )}
            </div>
          )}
        </div>

        <section className="editor-meta-panel" aria-label="Note details">
          <div className="field">
            <span id="editor-category-label">Category</span>
            {categoryOptions.length > 0 && (
              <div className="category-choice-list" aria-label="Existing categories">
                {categoryOptions.map((option) => (
                  <button
                    className={`category-choice ${category.trim() === option.name ? 'is-active' : ''}`}
                    type="button"
                    key={option.id}
                    onClick={() => selectCategory(option.name)}
                    aria-pressed={category.trim() === option.name}
                  >
                    {option.name}
                  </button>
                ))}
              </div>
            )}
            {!selectedExistingCategory && (
              <label className="category-custom-field">
                <span className="sr-only">Category</span>
                <input
                  className="input"
                  value={category}
                  onChange={(event) => markEdited(setCategory)(event.target.value)}
                  placeholder="New category"
                />
              </label>
            )}
          </div>

          <label className="field">
            <span>Tags</span>
            <input
              className="input"
              value={tagText}
              onChange={(event) => markEdited(setTagText)(event.target.value)}
              placeholder="ideas, project, reference"
            />
          </label>
        </section>

        {error && (
          <p className="form-status is-error" role="alert">
            {error}
          </p>
        )}

        <div className="editor-actions">
          <span
            className={`form-status editor-save-status ${saveStatusLabel ? 'is-visible' : ''}`}
            role={saveStatusLabel === 'Saving...' ? 'status' : undefined}
          >
            {saveStatusLabel}
          </span>
          <div className="editor-button-group">
            {currentDocument?.id && (
              <button className="btn btn-danger" type="button" onClick={handleDelete}>
                Delete
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default EditorScreen;
