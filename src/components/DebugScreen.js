import { useEffect, useState } from 'react';
import {
  formatPerformanceMetric,
  getPerformanceMetrics,
  summarizePerformanceMetrics,
} from '../performanceMonitoring';
import { knowledgeDB } from '../db';
import useScreenFocus from '../hooks/useScreenFocus';

const TEST_CATEGORY_NAMES = [
  'Test People',
  'Test Places',
  'Test Things',
  'Test Projects',
  'Test Media',
  'Test Ideas',
  'Test Research',
  'Test Archive',
];

const TEST_TAG_NAMES = [
  'test-alpha',
  'test-beta',
  'test-gamma',
  'test-delta',
  'test-review',
  'test-draft',
  'test-reference',
  'test-follow-up',
  'test-urgent',
  'test-someday',
];

const TEST_NOTE_COUNT = 50;

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function pickRandomTags() {
  const shuffledTags = [...TEST_TAG_NAMES].sort(() => Math.random() - 0.5);
  const tagCount = 1 + Math.floor(Math.random() * 3);
  return shuffledTags.slice(0, tagCount);
}

function createTestNote(index, batchId) {
  const categoryName = pickRandom(TEST_CATEGORY_NAMES);
  const tags = pickRandomTags();
  const noteNumber = String(index + 1).padStart(2, '0');

  return {
    title: `Test Note ${noteNumber}`,
    content: [
      `## Test Note ${noteNumber}`,
      `Generated debug note for ${categoryName}.`,
      `- [ ] Review generated item ${noteNumber}`,
      `- [x] Confirm test flag`,
    ].join('\n'),
    contentFormat: 'markdown',
    preview: `Generated debug note for ${categoryName}.`,
    category: categoryName,
    categoryName,
    tags,
    isTestData: true,
    testDataBatch: batchId,
  };
}

function DebugScreen({ onBack }) {
  const headingRef = useScreenFocus();
  const [performanceMetrics, setPerformanceMetrics] = useState(() => summarizePerformanceMetrics());
  const [testDataStatus, setTestDataStatus] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    const refreshPerformanceMetrics = () => {
      setPerformanceMetrics(summarizePerformanceMetrics(getPerformanceMetrics()));
    };

    window.addEventListener('performance:metric', refreshPerformanceMetrics);
    return () => window.removeEventListener('performance:metric', refreshPerformanceMetrics);
  }, []);

  const ensureTestCategories = async () => {
    const existingCategories = await knowledgeDB.getAllCategories();
    const existingCategoryIds = new Set(existingCategories.map((category) => category.id));

    await Promise.all(TEST_CATEGORY_NAMES.map(async (name) => {
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (existingCategoryIds.has(id)) return;

      await knowledgeDB.createCategory({ name, isTestData: true });
    }));
  };

  const ensureTestTags = async () => {
    const existingTags = await knowledgeDB.getAllTags();
    const existingTagIds = new Set(existingTags.map((tag) => tag.id));

    await Promise.all(TEST_TAG_NAMES.map(async (name) => {
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (existingTagIds.has(id)) return;

      await knowledgeDB.createTag({ name, isTestData: true });
    }));
  };

  const addTestData = async () => {
    try {
      setIsWorking(true);
      setTestDataStatus('Adding test data...');
      const batchId = `debug-${Date.now()}`;

      await ensureTestCategories();
      await ensureTestTags();

      for (let index = 0; index < TEST_NOTE_COUNT; index += 1) {
        await knowledgeDB.createDocument(createTestNote(index, batchId));
      }

      setTestDataStatus(`Added ${TEST_NOTE_COUNT} test notes.`);
    } catch (error) {
      setTestDataStatus(error?.message || 'Test data could not be added.');
    } finally {
      setIsWorking(false);
    }
  };

  const removeTestData = async () => {
    try {
      setIsWorking(true);
      setTestDataStatus('Removing test data...');

      const [documents, categories, tags] = await Promise.all([
        knowledgeDB.getAllDocuments(),
        knowledgeDB.getAllCategories(),
        knowledgeDB.getAllTags(),
      ]);
      const testDocuments = documents.filter((document) => document?.isTestData);
      const testCategories = categories.filter((category) => category?.isTestData);
      const testTags = tags.filter((tag) => tag?.isTestData);

      for (const document of testDocuments) {
        await knowledgeDB.deleteDocument(document.id);
      }

      for (const category of testCategories) {
        await knowledgeDB.deleteCategory(category.id);
      }

      for (const tag of testTags) {
        await knowledgeDB.deleteTag(tag.id);
      }

      setTestDataStatus(`Removed ${testDocuments.length} test notes.`);
    } catch (error) {
      setTestDataStatus(error?.message || 'Test data could not be removed.');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <main id="main-content" className="app-view" tabIndex="-1">
      <header className="app-view-header">
        <button className="text-button" type="button" onClick={onBack}>
          Back
        </button>
        <h1 ref={headingRef} tabIndex="-1">Debug</h1>
      </header>

      <section className="utility-panel settings-panel" aria-label="Debug tools">
        <section className="settings-group" aria-labelledby="test-data-title">
          <h2 id="test-data-title">Test Data</h2>
          <p>Add 50 flagged notes with random test categories and tags, or remove generated test data.</p>
          <div className="settings-action-list">
            <button className="settings-action-row" type="button" onClick={addTestData} disabled={isWorking} aria-label="Add test data">
              Add
            </button>
            <button className="settings-action-row is-danger" type="button" onClick={removeTestData} disabled={isWorking} aria-label="Remove test data">
              Remove
            </button>
          </div>
          {testDataStatus && (
            <p className="form-status" role="status">{testDataStatus}</p>
          )}
        </section>

        <section className="settings-group" aria-labelledby="performance-monitoring-title">
          <h2 id="performance-monitoring-title">Performance</h2>
          {performanceMetrics.length ? (
            <div className="management-list">
              {performanceMetrics.map((metric) => (
                <div className="management-row" key={metric.name}>
                  <span>
                    <strong>{metric.name}</strong>
                    <small>{metric.rating}</small>
                  </span>
                  <span>{formatPerformanceMetric(metric)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p>No performance metrics yet.</p>
          )}
        </section>
      </section>
    </main>
  );
}

export default DebugScreen;
