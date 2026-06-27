import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, BriefcaseBusiness, Image, MapPin, UsersRound } from 'lucide-react';
import LazyDocumentCard from './LazyDocumentCard';
import { knowledgeDB } from '../db';
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
        {pullStatus === 'refreshing' ? 'Refreshing documents...' : pullLabel}
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
          aria-label="Create new document"
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
              aria-label={`${area.name}, ${area.count || 0} documents`}
              onClick={() => setActiveFilter((currentFilter) => (
                currentFilter === area.name ? 'All' : area.name
              ))}
              aria-pressed={activeFilter === area.name}
            >
              <span className="category-chip-icon">
                <CategoryIcon name={area.name} />
              </span>
              <span className="category-chip-name">{area.name}</span>
              <span className="category-chip-count">{area.count || 0}</span>
            </button>
          )) : (
            <div className="document-state">
              <strong>No categories yet</strong>
              <span>Save a document with a category to organize this list.</span>
            </div>
          )}
        </div>
      </section>

      <section className="home-section" aria-label="Recent documents">
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
    </main>
  );
}

export default HomeScreen;
