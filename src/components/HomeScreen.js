import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, BriefcaseBusiness, Image, MapPin, UsersRound } from 'lucide-react';
import LazyDocumentCard from './LazyDocumentCard';
import { knowledgeDB } from '../db';
import { createPlainPreview } from '../textFormatting';
import useScreenFocus from '../hooks/useScreenFocus';

const PULL_TO_REFRESH_THRESHOLD = 64;
const MAX_PULL_DISTANCE = 96;
const DEFAULT_CATEGORY_ORDER = ['People', 'Places', 'Things', 'Projects', 'Media'];
const CATEGORY_ICON_MAP = {
  People: UsersRound,
  Places: MapPin,
  Things: Box,
  Projects: BriefcaseBusiness,
  Media: Image,
};

function createCategoryKey(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom';
}

function CategoryIcon({ name }) {
  const Icon = CATEGORY_ICON_MAP[name];

  if (Icon) {
    return <Icon aria-hidden="true" size={24} strokeWidth={2.6} />;
  }

  return <span aria-hidden="true">{String(name || '?').trim().slice(0, 1).toUpperCase()}</span>;
}

function getDocumentTime(document) {
  const value = document.updatedAt || document.lastModified || document.createdAt || 0;
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function renderModalContent(value = '', onToggleTask) {
  const lines = String(value).split('\n');

  return lines.map((line, index) => {
    const trimmedLine = line.trim();
    const taskMatch = trimmedLine.match(/^[-*]\s+\[([ xX])\]\s?(.*)$/);
    const bulletMatch = trimmedLine.match(/^[-*]\s+(.*)$/);

    if (!trimmedLine) {
      return <span className="note-modal-blank-line" aria-hidden="true" key={`blank-${index}`}></span>;
    }

    if (trimmedLine.startsWith('## ')) {
      return <h3 key={`${trimmedLine}-${index}`}>{trimmedLine.slice(3)}</h3>;
    }

    if (trimmedLine.startsWith('# ')) {
      return <h3 key={`${trimmedLine}-${index}`}>{trimmedLine.slice(2)}</h3>;
    }

    if (taskMatch) {
      const isChecked = taskMatch[1].toLowerCase() === 'x';

      return (
        <div className="note-modal-task" key={`${trimmedLine}-${index}`}>
          <button
            className={`document-card-task-box note-modal-task-button ${isChecked ? 'is-checked' : ''}`}
            type="button"
            aria-label={`${isChecked ? 'Mark incomplete' : 'Mark complete'}: ${taskMatch[2] || `item ${index + 1}`}`}
            onClick={() => onToggleTask(index)}
          >
            {isChecked ? '✓' : ''}
          </button>
          <span>{taskMatch[2]}</span>
        </div>
      );
    }

    if (bulletMatch) {
      return <p className="note-modal-bullet" key={`${trimmedLine}-${index}`}>{bulletMatch[1]}</p>;
    }

    return <p key={`${trimmedLine}-${index}`}>{trimmedLine}</p>;
  });
}

function HomeScreen({ onNavigate, onNewDocument, onOpenDocument }) {
  const headingRef = useScreenFocus();
  const [activeFilter, setActiveFilter] = useState('All');
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [documentStatus, setDocumentStatus] = useState('loading');
  const [documentError, setDocumentError] = useState('');
  const [selectedNote, setSelectedNote] = useState(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [pullStatus, setPullStatus] = useState('idle');
  const touchStartY = useRef(null);

  const loadDocuments = useCallback(async ({ silent = false } = {}) => {
    if (!('indexedDB' in window)) {
      setDocuments([]);
      setDocumentStatus('error');
      setDocumentError('Local note storage is not available in this browser.');
      return;
    }

    try {
      if (!silent) setDocumentStatus('loading');
      setDocumentError('');

      const [storedDocuments, storedCategories] = await Promise.all([
        knowledgeDB.getAllDocuments(),
        knowledgeDB.getAllCategories(),
      ]);
      setDocuments(Array.isArray(storedDocuments) ? storedDocuments : []);
      setCategories(Array.isArray(storedCategories) ? storedCategories : []);
      setDocumentStatus('ready');
    } catch (error) {
      setDocuments([]);
      setCategories([]);
      setDocumentStatus('error');
      setDocumentError(error?.message || 'Local notes could not be loaded.');
    }
  }, []);

  useEffect(() => {
    loadDocuments();

    const handleDocumentsChanged = () => loadDocuments({ silent: true });

    window.addEventListener('documents:changed', handleDocumentsChanged);
    return () => window.removeEventListener('documents:changed', handleDocumentsChanged);
  }, [loadDocuments]);

  const recentDocuments = useMemo(() => {
    return [...documents]
      .filter((document) => {
        if (activeFilter === 'All') return true;

        return (document.categoryName || document.category) === activeFilter;
      })
      .sort((first, second) => getDocumentTime(second) - getDocumentTime(first));
  }, [activeFilter, documents]);

  const categoryAreas = useMemo(() => {
    return [...categories].sort((first, second) => {
      const firstDefaultIndex = DEFAULT_CATEGORY_ORDER.indexOf(first.name);
      const secondDefaultIndex = DEFAULT_CATEGORY_ORDER.indexOf(second.name);

      if (firstDefaultIndex !== -1 || secondDefaultIndex !== -1) {
        if (firstDefaultIndex === -1) return 1;
        if (secondDefaultIndex === -1) return -1;
        return firstDefaultIndex - secondDefaultIndex;
      }

      if ((second.count || 0) !== (first.count || 0)) {
        return (second.count || 0) - (first.count || 0);
      }

      return first.name.localeCompare(second.name);
    });
  }, [categories]);

  useEffect(() => {
    const categoryNames = categoryAreas.map((category) => category.name);

    if (activeFilter !== 'All' && !categoryNames.includes(activeFilter)) {
      setActiveFilter('All');
    }
  }, [activeFilter, categoryAreas]);

  useEffect(() => {
    if (!selectedNote) return undefined;

    const handleModalKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectedNote(null);
      }
    };

    window.addEventListener('keydown', handleModalKeyDown);
    return () => window.removeEventListener('keydown', handleModalKeyDown);
  }, [selectedNote]);

  const handleTouchStart = (event) => {
    if (window.scrollY > 0 || documentStatus === 'loading') {
      touchStartY.current = null;
      return;
    }

    touchStartY.current = event.touches[0].clientY;
  };

  const handleTouchMove = (event) => {
    if (touchStartY.current === null) return;

    const distance = event.touches[0].clientY - touchStartY.current;

    if (distance <= 0) {
      setPullDistance(0);
      setPullStatus('idle');
      return;
    }

    const easedDistance = Math.min(distance * 0.55, MAX_PULL_DISTANCE);
    setPullDistance(easedDistance);
    setPullStatus(easedDistance >= PULL_TO_REFRESH_THRESHOLD ? 'ready' : 'pulling');
  };

  const handleTouchEnd = async () => {
    if (touchStartY.current === null) return;

    const shouldRefresh = pullDistance >= PULL_TO_REFRESH_THRESHOLD;
    touchStartY.current = null;

    if (shouldRefresh) {
      setPullStatus('refreshing');
      setPullDistance(PULL_TO_REFRESH_THRESHOLD);
      try {
        await loadDocuments();
      } finally {
        setPullDistance(0);
        setPullStatus('idle');
      }
      return;
    }

    setPullDistance(0);
    setPullStatus('idle');
  };

  const pullLabel = pullStatus === 'ready' ? 'Release to refresh' : 'Pull to refresh';
  const selectedNoteTitle = selectedNote?.title?.trim() || 'Untitled note';
  const selectedNoteContent = selectedNote?.content || selectedNote?.preview || '';

  const toggleSelectedNoteTask = async (lineIndex) => {
    if (!selectedNote?.id) return;

    const content = selectedNote.content || '';
    const lines = content.split('\n');
    const line = lines[lineIndex] || '';
    const taskMatch = line.match(/^(\s*[-*]\s+\[)([ xX])(\]\s?.*)$/);

    if (!taskMatch) return;

    const nextMarker = taskMatch[2].toLowerCase() === 'x' ? ' ' : 'x';
    lines[lineIndex] = `${taskMatch[1]}${nextMarker}${taskMatch[3]}`;
    const nextContent = lines.join('\n');
    const updates = {
      content: nextContent,
      preview: createPlainPreview(nextContent),
    };

    try {
      const updatedNote = await knowledgeDB.updateDocument(selectedNote.id, updates);
      setSelectedNote(updatedNote);
      setDocuments((currentDocuments) => currentDocuments.map((document) => (
        document.id === updatedNote.id ? updatedNote : document
      )));
    } catch (error) {
      setDocumentError(error?.message || 'Checklist item could not be updated.');
    }
  };

  return (
    <main
      id="main-content"
      className="home-screen"
      tabIndex="-1"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div
        className={`pull-refresh ${pullStatus !== 'idle' ? 'is-visible' : ''}`}
        style={{ transform: `translateY(${pullDistance}px)` }}
        role={pullStatus === 'refreshing' ? 'status' : undefined}
        aria-live="polite"
      >
        {pullStatus === 'refreshing' ? 'Refreshing notes...' : pullLabel}
      </div>

      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <div className="home-title-row">
            <h1 id="home-title" ref={headingRef} tabIndex="-1">Noted</h1>
            <p className="home-subtitle">local no cloud</p>
          </div>
        </div>

        <button
          className="home-menu-button"
          type="button"
          aria-label="Open settings"
          onClick={() => onNavigate('settings')}
        >
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
        </button>
      </section>

      <div className="floating-actions" aria-label="Primary actions">
        <button
          className="floating-action floating-action-primary"
          type="button"
          aria-label="Create new note"
          onClick={onNewDocument}
        >
          <span aria-hidden="true">+</span>
        </button>
        <button
          className="floating-action floating-action-secondary"
          type="button"
          aria-label="Search"
          onClick={() => onNavigate('search')}
        >
          <span className="floating-search-icon" aria-hidden="true"></span>
        </button>
      </div>

      <section className="home-section home-category-section" aria-label="Categories">
        <div className="category-rail" aria-label="Categories">
          {categoryAreas.length ? categoryAreas.map((area) => (
            <button
              className={`category-chip category-chip-${createCategoryKey(area.name)} ${activeFilter === area.name ? 'is-active' : ''}`}
              type="button"
              key={area.id}
              aria-label={`${area.name}, ${area.count || 0} notes`}
              onClick={() => setActiveFilter((currentFilter) => (
                currentFilter === area.name ? 'All' : area.name
              ))}
              aria-pressed={activeFilter === area.name}
            >
              <span className="category-chip-icon">
                <CategoryIcon name={area.name} />
              </span>
              <span className="category-chip-name">{area.name}</span>
            </button>
          )) : (
            <div className="document-state">
              <strong>No categories yet</strong>
              <span>Save a note with a category to organize this list.</span>
            </div>
          )}
        </div>
      </section>

      <section className="home-section" aria-label="Recent notes">
        {documentStatus === 'loading' && (
          <div className="document-state" role="status">
            <span className="spinner" aria-hidden="true"></span>
            <span>Loading notes...</span>
          </div>
        )}

        {documentStatus === 'error' && (
          <div className="document-state is-error" role="alert">
            <strong>Notes could not load.</strong>
            <span>{documentError || 'Try refreshing the list.'}</span>
          </div>
        )}

        {documentStatus === 'ready' && recentDocuments.length === 0 && (
          <div className="document-state">
            <strong>{documents.length ? 'No matching notes' : 'No notes yet'}</strong>
            <span>
              {documents.length
                ? 'Clear the filter or create a note in this area.'
                : 'Create your first note to start building your library.'}
            </span>
          </div>
        )}

        {documentStatus === 'ready' && recentDocuments.length > 0 && (
          <div className="document-grid" aria-label="Recent notes">
            {recentDocuments.map((document, index) => (
              <LazyDocumentCard
                document={document}
                eager={index < 6}
                key={document.id}
                onSelect={setSelectedNote}
              />
            ))}
          </div>
        )}
      </section>

      {selectedNote && (
        <div className="note-modal-backdrop" role="presentation" onMouseDown={() => setSelectedNote(null)}>
          <section
            className="note-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="note-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="note-modal-header">
              <h2 id="note-modal-title">{selectedNoteTitle}</h2>
              <button className="text-button" type="button" onClick={() => setSelectedNote(null)}>
                Close
              </button>
            </header>
            <div className="note-modal-content">
              {selectedNoteContent.trim() ? renderModalContent(selectedNoteContent, toggleSelectedNoteTask) : (
                <p className="note-modal-empty">No content yet.</p>
              )}
            </div>
            <footer className="note-modal-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  const noteToEdit = selectedNote;
                  setSelectedNote(null);
                  onOpenDocument(noteToEdit);
                }}
              >
                Edit
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}

export default HomeScreen;
