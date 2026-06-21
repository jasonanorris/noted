import { Suspense, lazy, useEffect, useRef, useState } from 'react';

const DocumentCard = lazy(() => import('./DocumentCard'));

function DocumentCardPlaceholder() {
  return (
    <div className="document-card document-card-skeleton" aria-hidden="true">
      <span className="skeleton-line skeleton-title"></span>
      <span className="skeleton-line"></span>
      <span className="skeleton-line skeleton-short"></span>
    </div>
  );
}

function LazyDocumentCard({ document, eager = false, onSelect }) {
  const cardRef = useRef(null);
  const [shouldRender, setShouldRender] = useState(eager);

  useEffect(() => {
    if (shouldRender || eager) return undefined;

    if (!('IntersectionObserver' in window)) {
      setShouldRender(true);
      return undefined;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;

      setShouldRender(true);
      observer.disconnect();
    }, { rootMargin: '320px' });

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, [eager, shouldRender]);

  return (
    <div className="lazy-document-card" ref={cardRef}>
      {shouldRender ? (
        <Suspense fallback={<DocumentCardPlaceholder />}>
          <DocumentCard document={document} onSelect={onSelect} />
        </Suspense>
      ) : (
        <DocumentCardPlaceholder />
      )}
    </div>
  );
}

export default LazyDocumentCard;
