import { useCallback, useEffect, useMemo, useState } from 'react';
import DocumentCard from './DocumentCard';
import { knowledgeDB } from '../db';
import { stripFormatting } from '../textFormatting';

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

function SearchScreen({ onBack, onOpenDocument }) {
  const [query, setQuery] = useState('');
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

  const results = useMemo(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return documents;

    return documents.filter((document) => matchesQuery(document, trimmedQuery));
  }, [documents, query]);

  return (
    <main className="app-view search-view">
      <header className="app-view-header">
        <button className="text-button" type="button" onClick={onBack}>
          Back
        </button>
        <h1>Search</h1>
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
            <span>{documents.length ? 'Try another search.' : 'Create a document first.'}</span>
          </div>
        )}

        {status === 'ready' && results.length > 0 && (
          <div className="document-grid" aria-label="Search results">
            {results.map((document) => (
              <DocumentCard document={document} key={document.id} onSelect={onOpenDocument} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default SearchScreen;
