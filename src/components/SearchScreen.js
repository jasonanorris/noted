import { useCallback, useEffect, useMemo, useState } from 'react';
import DocumentCard from './DocumentCard';
import { knowledgeDB } from '../db';
import { stripFormatting } from '../textFormatting';
import useScreenFocus from '../hooks/useScreenFocus';

const ALL_CATEGORIES = 'all-categories';
const ALL_TAGS = 'all-tags';

function createOptionList(values, fallbackValue) {
  return Array.from(new Set(values.map((value) => value?.trim() || fallbackValue))).sort((first, second) =>
    first.localeCompare(second)
  );
}

function matchesQuery(document, query) {
  const searchText = [
    document.title,
    document.content,
    document.preview,
    document.categoryName,
    document.category,
    ...(Array.isArray(document.tags) ? document.tags : []),
  ].join(' ').toLowerCase();

  return stripFormatting(searchText).includes(query.toLowerCase());
}

function matchesFilters(document, categoryFilter, tagFilter) {
  const category = document.categoryName || document.category || 'Unfiled';
  const tags = Array.isArray(document.tags) ? document.tags.filter(Boolean) : [];

  return (categoryFilter === ALL_CATEGORIES || category === categoryFilter)
    && (tagFilter === ALL_TAGS || tags.includes(tagFilter));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(value, query) {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) return value;

  const parts = String(value).split(new RegExp(`(${escapeRegExp(trimmedQuery)})`, 'gi'));

  return parts.map((part, index) => {
    if (part.toLowerCase() !== trimmedQuery.toLowerCase()) return part;

    return <mark className="search-highlight" key={`${part}-${index}`}>{part}</mark>;
  });
}

function SearchScreen({ onBack, onOpenDocument }) {
  const headingRef = useScreenFocus();
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [tagFilter, setTagFilter] = useState(ALL_TAGS);
  const [documents, setDocuments] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  const loadDocuments = useCallback(async () => {
    try {
      setStatus('loading');
      setError('');
      const storedDocuments = await knowledgeDB.getAllDocuments();
      setDocuments(Array.isArray(storedDocuments) ? storedDocuments : []);
      setStatus('ready');
    } catch (loadError) {
      setDocuments([]);
      setStatus('error');
      setError(loadError?.message || 'Search index could not be loaded.');
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const categoryOptions = useMemo(() => {
    return createOptionList(
      documents.map((document) => document.categoryName || document.category),
      'Unfiled'
    );
  }, [documents]);

  const tagOptions = useMemo(() => {
    return createOptionList(
      documents.flatMap((document) => (Array.isArray(document.tags) ? document.tags : [])),
      ''
    ).filter(Boolean);
  }, [documents]);

  useEffect(() => {
    if (categoryFilter !== ALL_CATEGORIES && !categoryOptions.includes(categoryFilter)) {
      setCategoryFilter(ALL_CATEGORIES);
    }
  }, [categoryFilter, categoryOptions]);

  useEffect(() => {
    if (tagFilter !== ALL_TAGS && !tagOptions.includes(tagFilter)) {
      setTagFilter(ALL_TAGS);
    }
  }, [tagFilter, tagOptions]);

  const results = useMemo(() => {
    const trimmedQuery = query.trim();

    return documents.filter((document) => {
      const queryMatches = !trimmedQuery || matchesQuery(document, trimmedQuery);

      return queryMatches && matchesFilters(document, categoryFilter, tagFilter);
    });
  }, [categoryFilter, documents, query, tagFilter]);

  const hasActiveFilters = categoryFilter !== ALL_CATEGORIES || tagFilter !== ALL_TAGS;
  const resultSummary = `${results.length} ${results.length === 1 ? 'result' : 'results'}`;

  return (
    <main id="main-content" className="app-view search-view" tabIndex="-1">
      <header className="app-view-header">
        <button className="text-button" type="button" onClick={onBack}>
          Back
        </button>
        <h1 ref={headingRef} tabIndex="-1">Search</h1>
      </header>

      <section className="search-shell" aria-label="Search documents">
        <label className="field">
          <span>Search documents</span>
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, content, tags, or category"
          />
        </label>

        <div className="search-filter-grid" aria-label="Search filters">
          <label className="field">
            <span>Category</span>
            <select
              className="input"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value={ALL_CATEGORIES}>All categories</option>
              {categoryOptions.map((category) => (
                <option value={category} key={category}>{category}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Tag</span>
            <select
              className="input"
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
            >
              <option value={ALL_TAGS}>All tags</option>
              {tagOptions.map((tag) => (
                <option value={tag} key={tag}>{tag}</option>
              ))}
            </select>
          </label>
        </div>

        {status === 'ready' && (
          <div className="search-summary" role="status">
            <span>{resultSummary}</span>
            {(query.trim() || hasActiveFilters) && (
              <button
                className="text-button"
                type="button"
                aria-label="Clear search and filters"
                onClick={() => {
                  setQuery('');
                  setCategoryFilter(ALL_CATEGORIES);
                  setTagFilter(ALL_TAGS);
                }}
              >
                Clear
              </button>
            )}
          </div>
        )}

        {status === 'loading' && (
          <div className="document-state" role="status">
            <span className="spinner" aria-hidden="true"></span>
            <span>Loading documents...</span>
          </div>
        )}

        {status === 'error' && (
          <div className="document-state is-error" role="alert">
            <strong>Search could not load.</strong>
            <span>{error}</span>
          </div>
        )}

        {status === 'ready' && results.length === 0 && (
          <div className="document-state">
            <strong>No results</strong>
            <span>
              {documents.length
                ? 'Try another search or clear the filters.'
                : 'Create a document first.'}
            </span>
          </div>
        )}

        {status === 'ready' && results.length > 0 && (
          <div className="document-grid" aria-label="Search results">
            {results.map((document) => (
              <DocumentCard
                document={document}
                highlightText={(value) => highlightText(value, query)}
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

export default SearchScreen;
