import { createPlainPreview, stripFormatting } from '../textFormatting';

function createPreviewItems(document) {
  const source = document.content || document.preview || document.excerpt || '';
  const lines = String(source)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const items = lines
    .map((line) => {
      const bulletMatch = line.match(/^[-*]\s+(.+)/);

      if (bulletMatch) {
        return {
          text: stripFormatting(bulletMatch[1]),
          type: 'bullet',
        };
      }

      return {
        text: stripFormatting(line),
        type: 'text',
      };
    })
    .filter((item) => item.text)
    .slice(0, 3);

  return items.length ? items : [{ text: createPlainPreview(source), type: 'text' }];
}

function renderText(value, renderer) {
  return renderer ? renderer(value) : value;
}

function DocumentCard({ document = {}, highlightText, onSelect }) {
  const title = document.title?.trim() || 'Untitled document';
  const previewItems = createPreviewItems(document);
  const category = document.categoryName || document.category || 'Unfiled';
  const tags = Array.isArray(document.tags) ? document.tags.filter(Boolean).slice(0, 3) : [];

  const handleSelect = () => {
    if (onSelect) onSelect(document);
  };

  return (
    <button className="document-card" type="button" onClick={handleSelect}>
      <span className="document-card-heading">
        <span className="document-card-title">{renderText(title, highlightText)}</span>
        <span className="document-card-category">{category}</span>
      </span>
      <span className="document-card-preview">
        {previewItems.map((item, index) => (
          <span className={`document-card-preview-line ${item.type === 'bullet' ? 'is-bullet' : ''}`} key={`${item.text}-${index}`}>
            {renderText(item.text, highlightText)}
          </span>
        ))}
      </span>

      {tags.length > 0 && (
        <span className="document-card-tags" aria-label="Document tags">
          {tags.map((tag, index) => (
            <span className={`document-card-tag tag-tone-${(index % 4) + 1}`} key={tag}>
              {renderText(tag, highlightText)}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

export default DocumentCard;
