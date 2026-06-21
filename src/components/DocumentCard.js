import { createPlainPreview } from '../textFormatting';

function formatUpdatedDate(value) {
  if (!value) return 'Not saved yet';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unknown';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date);
}

function getPreview(document) {
  const preview = document.preview || document.excerpt || document.content || '';

  return createPlainPreview(preview);
}

function DocumentCard({ document = {}, onSelect }) {
  const title = document.title?.trim() || 'Untitled document';
  const preview = getPreview(document);
  const category = document.categoryName || document.category || 'Unfiled';
  const tags = Array.isArray(document.tags) ? document.tags.filter(Boolean).slice(0, 3) : [];
  const updatedAt = document.updatedAt || document.lastModified || document.createdAt;

  const handleSelect = () => {
    if (onSelect) onSelect(document);
  };

  return (
    <button className="document-card" type="button" onClick={handleSelect}>
      <span className="document-card-category">{category}</span>

      <span className="document-card-title">{title}</span>
      <span className="document-card-preview">{preview}</span>

      <span className="document-card-meta">
        <span>{formatUpdatedDate(updatedAt)}</span>
        <span>{tags.length ? `${tags.length} tags` : 'No tags'}</span>
      </span>

      <span className="document-card-tags" aria-label={tags.length ? 'Document tags' : 'No document tags'}>
        {tags.length ? (
          tags.map((tag) => (
            <span className="document-card-tag" key={tag}>{tag}</span>
          ))
        ) : (
          <span className="document-card-tag is-empty">Add tags</span>
        )}
      </span>
    </button>
  );
}

export default DocumentCard;
