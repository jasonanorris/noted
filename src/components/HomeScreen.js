import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LazyDocumentCard from './LazyDocumentCard';
import { knowledgeDB } from '../db';
import useScreenFocus from '../hooks/useScreenFocus';

const PULL_TO_REFRESH_THRESHOLD = 64;
const MAX_PULL_DISTANCE = 96;

const quickActions = [
  { id: 'new', label: 'New', symbol: '+' },
  { id: 'import', label: 'Import', symbol: '^' },
  { id: 'search', label: 'Search', symbol: '/' },
  { id: 'settings', label: 'Settings', symbol: '*' },
];

function getDocumentTime(document) {
  const value = document.updatedAt || document.lastModified || document.createdAt || 0;
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function HomeScreen({ onNavigate, onNewDocument, onOpenDocument }) {
  const headingRef = useScreenFocus();
  const [activeFilter, setActiveFilter] = useState('All');
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [documentStatus, setDocumentStatus] = useState('loading');
  const [documentError, setDocumentError] = useState('');
  const [pullDistance, setPullDistance] = useState(0);
  const [pullStatus, setPullStatus] = useState('idle');
  const touchStartY = useRef(null);

  const loadDocuments = useCallback(async ({ silent = false } = {}) => {
    if (!('indexedDB' in window)) {
      setDocuments([]);
      setDocumentStatus('error');
      setDocumentError('Local document storage is not available in this browser.');
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
      setDocumentError(error?.message || 'Local documents could not be loaded.');
    }
  }, []);

  useEffect(() => {
    loadDocuments();

    const handleDocumentsChanged = () => loadDocuments({ silent: true });

    window.addEventListener('documents:changed', handleDocumentsChanged);
    return () => window.removeEventListener('documents:changed', handleDocumentsChanged);
  }, [loadDocuments]);

  const documentFilters = useMemo(() => {
    const categories = documents
      .map((document) => document.categoryName || document.category)
      .filter(Boolean);

    return ['All', ...Array.from(new Set(categories))];
  }, [documents]);

  useEffect(() => {
    if (!documentFilters.includes(activeFilter)) {
      setActiveFilter('All');
    }
  }, [activeFilter, documentFilters]);

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
      if ((second.count || 0) !== (first.count || 0)) {
        return (second.count || 0) - (first.count || 0);
      }

      return first.name.localeCompare(second.name);
    });
  }, [categories]);

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

  return (
    <main
      className="home-screen"
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
        {pullStatus === 'refreshing' ? 'Refreshing documents...' : pullLabel}
      </div>

      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <p className="home-kicker">Noted</p>
          <h1 id="home-title" ref={headingRef} tabIndex="-1">Knowledge Storage</h1>
          <p className="home-subtitle">Capture, sort, and reopen your notes.</p>
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

      <section className="home-section" aria-labelledby="quick-actions-title">
        <div className="home-section-header">
          <h2 id="quick-actions-title">Quick Actions</h2>
        </div>

        <div className="quick-action-grid" role="list">
          {quickActions.map((action) => (
            <div className="quick-action-item" key={action.id} role="listitem">
              <button
                className="quick-action"
                type="button"
                aria-label={action.id === 'new' ? 'Create new document' : action.label}
                onClick={() => {
                  if (action.id === 'new') {
                    onNewDocument();
                    return;
                  }

                  onNavigate(action.id);
                }}
              >
                <span className="quick-action-symbol" aria-hidden="true">{action.symbol}</span>
                <span>{action.label}</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="home-section" aria-labelledby="documents-title">
        <div className="home-section-header">
          <h2 id="documents-title">Recent Documents</h2>
          <div className="document-header-actions">
            <button className="text-button" type="button" onClick={() => loadDocuments()}>
              Refresh
            </button>
            <button className="text-button" type="button" onClick={() => setActiveFilter('All')}>View all documents</button>
          </div>
        </div>

        <div className="document-filter-bar" aria-label="Filter recent documents">
          {documentFilters.map((filter) => (
            <button
              className={`document-filter ${activeFilter === filter ? 'is-active' : ''}`}
              type="button"
              key={filter}
              onClick={() => setActiveFilter(filter)}
              aria-pressed={activeFilter === filter}
            >
              {filter}
            </button>
          ))}
        </div>

        {documentStatus === 'loading' && (
          <div className="document-state" role="status">
            <span className="spinner" aria-hidden="true"></span>
            <span>Loading documents...</span>
          </div>
        )}

        {documentStatus === 'error' && (
          <div className="document-state is-error" role="alert">
            <strong>Documents could not load.</strong>
            <span>{documentError || 'Try refreshing the list.'}</span>
          </div>
        )}

        {documentStatus === 'ready' && recentDocuments.length === 0 && (
          <div className="document-state">
            <strong>{documents.length ? 'No matching documents' : 'No documents yet'}</strong>
            <span>
              {documents.length
                ? 'Clear the filter or create a document in this area.'
                : 'Create your first note to start building your library.'}
            </span>
          </div>
        )}

        {documentStatus === 'ready' && recentDocuments.length > 0 && (
          <div className="document-grid" aria-label="Recent documents">
            {recentDocuments.map((document, index) => (
              <LazyDocumentCard
                document={document}
                eager={index < 6}
                key={document.id}
                onSelect={onOpenDocument}
              />
            ))}
          </div>
        )}
      </section>

      <section className="home-section" aria-labelledby="areas-title">
        <div className="home-section-header">
          <h2 id="areas-title">Categories</h2>
        </div>

        <div className="area-list">
          {categoryAreas.length ? categoryAreas.map((area) => (
            <button
              className="area-row"
              type="button"
              key={area.id}
              aria-label={`${area.name}, ${area.count || 0} documents`}
              onClick={() => setActiveFilter(area.name)}
            >
              <span>{area.name}</span>
              <span>{area.count || 0}</span>
            </button>
          )) : (
            <div className="document-state">
              <strong>No categories yet</strong>
              <span>Save a document with a category to organize this list.</span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default HomeScreen;
