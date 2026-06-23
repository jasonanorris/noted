// IndexedDB wrapper for knowledge app
const DB_NAME = 'knowledge-app-db';
const DB_VERSION = 4;

const REQUIRED_STORES = ['documents', 'categories', 'tags', 'settings'];
const BACKUP_STORES = ['documents', 'categories', 'tags', 'settings'];
const DEFAULT_CATEGORY_NAMES = ['People', 'Places', 'Things', 'Projects', 'Media'];

function createIndex(store, indexName, keyPath = indexName) {
  if (!store.indexNames.contains(indexName)) {
    store.createIndex(indexName, keyPath);
  }
}

function notifyDocumentsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('documents:changed'));
  }
}

function createDocumentId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createTaxonomyId(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unfiled';
}

function addRecord(store, record) {
  if (store.keyPath) {
    return store.add(record);
  }

  return store.add(record, record.id);
}

function putRecord(store, record, id) {
  if (store.keyPath) {
    return store.put(record);
  }

  return store.put(record, id);
}

function hasRequiredStores(db) {
  return REQUIRED_STORES.every((storeName) => db.objectStoreNames.contains(storeName));
}

function migrateDatabase(event) {
  const db = event.target.result;
  const transaction = event.target.transaction;

  // Create object stores if they don't exist
  let documentsStore;
  if (!db.objectStoreNames.contains('documents')) {
    documentsStore = db.createObjectStore('documents', { keyPath: 'id' });
  } else {
    documentsStore = transaction.objectStore('documents');
  }
  createIndex(documentsStore, 'title');
  createIndex(documentsStore, 'tags');
  createIndex(documentsStore, 'category');
  createIndex(documentsStore, 'createdAt');
  createIndex(documentsStore, 'updatedAt');

  let categoriesStore;
  if (!db.objectStoreNames.contains('categories')) {
    categoriesStore = db.createObjectStore('categories', { keyPath: 'id' });
  } else {
    categoriesStore = transaction.objectStore('categories');
  }
  createIndex(categoriesStore, 'name');
  createIndex(categoriesStore, 'parentId');

  let tagsStore;
  if (!db.objectStoreNames.contains('tags')) {
    tagsStore = db.createObjectStore('tags', { keyPath: 'id' });
  } else {
    tagsStore = transaction.objectStore('tags');
  }
  createIndex(tagsStore, 'name');

  if (!db.objectStoreNames.contains('settings')) {
    db.createObjectStore('settings', { keyPath: 'key' });
  }
}

function validateBackupData(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Backup file is not valid JSON data.');
  }

  BACKUP_STORES.forEach((storeName) => {
    if (data[storeName] && !Array.isArray(data[storeName])) {
      throw new Error(`Backup ${storeName} must be an array.`);
    }
  });
}

function sortByName(first, second) {
  return first.name.localeCompare(second.name);
}

function createDefaultCategory(name, timestamp) {
  return {
    id: createTaxonomyId(name),
    name,
    count: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    isDefault: true,
  };
}

export class KnowledgeDB {
  constructor() {
    this.db = null;
    this.isReady = false;
    this.ready = this._init();
  }

  async _init() {
    if (typeof indexedDB === 'undefined') {
      return;
    }

    return this._openDatabase(DB_VERSION);
  }

  async _openDatabase(version) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, version);

      request.onupgradeneeded = migrateDatabase;

      request.onsuccess = async (event) => {
        const db = event.target.result;

        if (!hasRequiredStores(db)) {
          const repairVersion = Math.max(db.version + 1, DB_VERSION + 1);
          db.close();

          try {
            await this._openDatabase(repairVersion);
            resolve();
          } catch (error) {
            reject(error);
          }
          return;
        }

        this.db = db;
        this.isReady = true;

        try {
          await this.ensureDefaultCategories();
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      request.onerror = (error) => {
        reject(error);
      };

      request.onblocked = () => {
        reject(new Error('Close other tabs using this app, then refresh to finish the storage upgrade.'));
      };
    });
  }

  async _ensureReady() {
    if (!this.isReady) {
      await this.ready;
    }

    if (!this.isReady) {
      throw new Error('IndexedDB is not available');
    }
  }

  // Documents operations
  async createDocument(document) {
    await this._ensureReady();

    const savedDocument = await new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['documents'], 'readwrite');
      const store = transaction.objectStore('documents');

      document.id = document.id || createDocumentId();
      document.createdAt = Date.now();
      document.updatedAt = Date.now();

      const request = addRecord(store, document);

      request.onsuccess = () => resolve(document);
      request.onerror = (error) => reject(error);
    });

    await this.rebuildTaxonomy();
    notifyDocumentsChanged();
    return savedDocument;
  }

  async getDocument(id) {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['documents'], 'readonly');
      const store = transaction.objectStore('documents');

      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (error) => reject(error);
    });
  }

  async updateDocument(id, updates) {
    await this._ensureReady();

    const savedDocument = await new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['documents'], 'readwrite');
      const store = transaction.objectStore('documents');

      const request = store.get(id);

      request.onsuccess = (event) => {
        const document = event.target.result;
        if (!document) return reject(new Error('Document not found'));

        Object.assign(document, updates, { updatedAt: Date.now() });

        const updateRequest = putRecord(store, document, id);
        updateRequest.onsuccess = () => resolve(document);
        updateRequest.onerror = (error) => reject(error);
      };

      request.onerror = (error) => reject(error);
    });

    await this.rebuildTaxonomy();
    notifyDocumentsChanged();
    return savedDocument;
  }

  async deleteDocument(id) {
    await this._ensureReady();

    await new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['documents'], 'readwrite');
      const store = transaction.objectStore('documents');

      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = (error) => reject(error);
    });

    await this.rebuildTaxonomy();
    notifyDocumentsChanged();
  }

  async getAllDocuments() {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['documents'], 'readonly');
      const store = transaction.objectStore('documents');

      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = (error) => reject(error);
    });
  }

  async getDocumentsByTag(tagName) {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['documents'], 'readonly');
      const store = transaction.objectStore('documents');
      const index = store.index('tags');

      // Tags are stored as an array of strings
      const request = index.getAll(tagName);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (error) => reject(error);
    });
  }

  async getDocumentsByCategory(categoryId) {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['documents'], 'readonly');
      const store = transaction.objectStore('documents');
      const index = store.index('category');

      const request = index.getAll(categoryId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (error) => reject(error);
    });
  }

  async searchDocuments(query) {
    await this._ensureReady();

    const allDocs = await this.getAllDocuments();

    return allDocs.filter(doc => {
      const searchableText = `${doc.title} ${doc.content}`.toLowerCase();
      return searchableText.includes(query.toLowerCase());
    });
  }

  // Categories operations
  async createCategory(category) {
    await this._ensureReady();

    const timestamp = Date.now();
    const categoryName = typeof category === 'string' ? category : category?.name;
    const trimmedName = String(categoryName || '').trim();
    if (!trimmedName) throw new Error('Category name is required.');

    const nextCategory = {
      ...(typeof category === 'object' && category ? category : {}),
      id: createTaxonomyId(trimmedName),
      name: trimmedName,
      count: 0,
      createdAt: category?.createdAt || timestamp,
      updatedAt: timestamp,
      isCustom: true,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['categories'], 'readwrite');
      const store = transaction.objectStore('categories');

      const request = store.get(nextCategory.id);

      request.onsuccess = () => {
        if (request.result) {
          reject(new Error('Category already exists.'));
          return;
        }

        const addRequest = store.add(nextCategory);
        addRequest.onsuccess = () => {
          notifyDocumentsChanged();
          resolve(nextCategory);
        };
        addRequest.onerror = () => reject(addRequest.error);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getCategory(id) {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['categories'], 'readonly');
      const store = transaction.objectStore('categories');

      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (error) => reject(error);
    });
  }

  async updateCategory(id, updates) {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['categories'], 'readwrite');
      const store = transaction.objectStore('categories');

      const request = store.get(id);

      request.onsuccess = (event) => {
        const category = event.target.result;
        if (!category) return reject(new Error('Category not found'));

        Object.assign(category, updates);

        const updateRequest = store.put(category);
        updateRequest.onsuccess = () => resolve(category);
        updateRequest.onerror = (error) => reject(error);
      };

      request.onerror = (error) => reject(error);
    });
  }

  async getAllCategories() {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['categories'], 'readonly');
      const store = transaction.objectStore('categories');

      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = (error) => reject(error);
    });
  }

  async ensureDefaultCategories() {
    await this._ensureReady();

    const timestamp = Date.now();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['categories'], 'readwrite');
      const store = transaction.objectStore('categories');

      DEFAULT_CATEGORY_NAMES.forEach((categoryName) => {
        const id = createTaxonomyId(categoryName);
        const request = store.get(id);

        request.onsuccess = () => {
          if (request.result) return;

          store.put(createDefaultCategory(categoryName, timestamp));
        };

        request.onerror = () => reject(request.error);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Default categories could not be created.'));
    });
  }

  // Tags operations
  async createTag(tag) {
    await this._ensureReady();

    const timestamp = Date.now();
    const tagName = typeof tag === 'string' ? tag : tag?.name;
    const trimmedName = String(tagName || '').trim();
    if (!trimmedName) throw new Error('Tag name is required.');

    const nextTag = {
      ...(typeof tag === 'object' && tag ? tag : {}),
      id: createTaxonomyId(trimmedName),
      name: trimmedName,
      count: 0,
      createdAt: tag?.createdAt || timestamp,
      updatedAt: timestamp,
      isCustom: true,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['tags'], 'readwrite');
      const store = transaction.objectStore('tags');

      const request = store.get(nextTag.id);

      request.onsuccess = () => {
        if (request.result) {
          reject(new Error('Tag already exists.'));
          return;
        }

        const addRequest = store.add(nextTag);
        addRequest.onsuccess = () => {
          notifyDocumentsChanged();
          resolve(nextTag);
        };
        addRequest.onerror = () => reject(addRequest.error);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getTag(id) {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['tags'], 'readonly');
      const store = transaction.objectStore('tags');

      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (error) => reject(error);
    });
  }

  async updateTag(id, updates) {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['tags'], 'readwrite');
      const store = transaction.objectStore('tags');

      const request = store.get(id);

      request.onsuccess = (event) => {
        const tag = event.target.result;
        if (!tag) return reject(new Error('Tag not found'));

        Object.assign(tag, updates);

        const updateRequest = store.put(tag);
        updateRequest.onsuccess = () => resolve(tag);
        updateRequest.onerror = (error) => reject(error);
      };

      request.onerror = (error) => reject(error);
    });
  }

  async getAllTags() {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['tags'], 'readonly');
      const store = transaction.objectStore('tags');

      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = (error) => reject(error);
    });
  }

  async rebuildTaxonomy() {
    await this._ensureReady();

    const [documents, existingCategories, existingTags] = await Promise.all([
      this.getAllDocuments(),
      this.getAllCategories(),
      this.getAllTags(),
    ]);
    const categoryMap = new Map();
    const tagMap = new Map();
    const timestamp = Date.now();

    existingCategories
      .filter((category) => category?.isCustom)
      .forEach((category) => {
        categoryMap.set(category.id, {
          ...category,
          count: 0,
          updatedAt: category.updatedAt || timestamp,
        });
      });

    DEFAULT_CATEGORY_NAMES.forEach((categoryName) => {
      const category = createDefaultCategory(categoryName, timestamp);
      if (!categoryMap.has(category.id)) {
        categoryMap.set(category.id, category);
      }
    });

    existingTags
      .filter((tag) => tag?.isCustom)
      .forEach((tag) => {
        tagMap.set(tag.id, {
          ...tag,
          count: 0,
          updatedAt: tag.updatedAt || timestamp,
        });
      });

    documents.forEach((document) => {
      const categoryName = (document.categoryName || document.category || 'Unfiled').trim() || 'Unfiled';
      const categoryId = createTaxonomyId(categoryName);
      const category = categoryMap.get(categoryId) || {
        id: categoryId,
        name: categoryName,
        count: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      category.count += 1;
      category.updatedAt = timestamp;
      categoryMap.set(categoryId, category);

      if (Array.isArray(document.tags)) {
        Array.from(new Set(document.tags.map((tag) => tag.trim()).filter(Boolean))).forEach((tagName) => {
          const tagId = createTaxonomyId(tagName);
          const tag = tagMap.get(tagId) || {
            id: tagId,
            name: tagName,
            count: 0,
            createdAt: timestamp,
            updatedAt: timestamp,
          };

          tag.count += 1;
          tag.updatedAt = timestamp;
          tagMap.set(tagId, tag);
        });
      }
    });

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['categories', 'tags'], 'readwrite');
      const categoriesStore = transaction.objectStore('categories');
      const tagsStore = transaction.objectStore('tags');

      categoriesStore.clear();
      tagsStore.clear();

      Array.from(categoryMap.values()).sort(sortByName).forEach((category) => categoriesStore.put(category));
      Array.from(tagMap.values()).sort(sortByName).forEach((tag) => tagsStore.put(tag));

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Tags and categories could not be rebuilt.'));
    });
  }

  async renameCategory(id, nextName) {
    await this._ensureReady();

    const trimmedName = nextName.trim();
    if (!trimmedName) throw new Error('Category name is required.');

    const category = await this.getCategory(id);
    if (!category) throw new Error('Category not found');

    await new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['documents'], 'readwrite');
      const store = transaction.objectStore('documents');
      const request = store.getAll();

      request.onsuccess = () => {
        request.result.forEach((document) => {
          const currentCategory = document.categoryName || document.category || 'Unfiled';
          if (currentCategory === category.name) {
            store.put({
              ...document,
              category: trimmedName,
              categoryName: trimmedName,
              updatedAt: Date.now(),
            });
          }
        });
      };

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Category could not be renamed.'));
    });

    await this.rebuildTaxonomy();
    notifyDocumentsChanged();
  }

  async deleteCategory(id) {
    await this._ensureReady();

    const category = await this.getCategory(id);
    if (!category) throw new Error('Category not found');

    await new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['documents'], 'readwrite');
      const store = transaction.objectStore('documents');
      const request = store.getAll();

      request.onsuccess = () => {
        request.result.forEach((document) => {
          const currentCategory = document.categoryName || document.category || 'Unfiled';
          if (currentCategory === category.name) {
            store.put({
              ...document,
              category: 'Unfiled',
              categoryName: 'Unfiled',
              updatedAt: Date.now(),
            });
          }
        });
      };

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Category could not be deleted.'));
    });

    await this.rebuildTaxonomy();
    notifyDocumentsChanged();
  }

  async renameTag(id, nextName) {
    await this._ensureReady();

    const trimmedName = nextName.trim();
    if (!trimmedName) throw new Error('Tag name is required.');

    const tag = await this.getTag(id);
    if (!tag) throw new Error('Tag not found');

    await new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['documents'], 'readwrite');
      const store = transaction.objectStore('documents');
      const request = store.getAll();

      request.onsuccess = () => {
        request.result.forEach((document) => {
          if (!Array.isArray(document.tags) || !document.tags.includes(tag.name)) return;

          const renamedTags = document.tags.map((currentTag) => (
            currentTag === tag.name ? trimmedName : currentTag
          ));

          store.put({
            ...document,
            tags: Array.from(new Set(renamedTags)),
            updatedAt: Date.now(),
          });
        });
      };

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Tag could not be renamed.'));
    });

    await this.rebuildTaxonomy();
    notifyDocumentsChanged();
  }

  async deleteTag(id) {
    await this._ensureReady();

    const tag = await this.getTag(id);
    if (!tag) throw new Error('Tag not found');

    await new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['documents'], 'readwrite');
      const store = transaction.objectStore('documents');
      const request = store.getAll();

      request.onsuccess = () => {
        request.result.forEach((document) => {
          if (!Array.isArray(document.tags) || !document.tags.includes(tag.name)) return;

          store.put({
            ...document,
            tags: document.tags.filter((currentTag) => currentTag !== tag.name),
            updatedAt: Date.now(),
          });
        });
      };

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Tag could not be deleted.'));
    });

    await this.rebuildTaxonomy();
    notifyDocumentsChanged();
  }

  // Settings operations
  async getSetting(key) {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');

      const request = store.get(key);

      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = (error) => reject(error);
    });
  }

  async setSetting(key, value) {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['settings'], 'readwrite');
      const store = transaction.objectStore('settings');

      const request = store.put({ key, value });

      request.onsuccess = () => resolve();
      request.onerror = (error) => reject(error);
    });
  }

  async getAllSettings() {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');

      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = (error) => reject(error);
    });
  }

  // Utility methods
  async exportData() {
    await this._ensureReady();

    const [documents, categories, tags, settings] = await Promise.all([
      this.getAllDocuments(),
      this.getAllCategories(),
      this.getAllTags(),
      this.getAllSettings(),
    ]);

    return {
      app: 'noted',
      version: 1,
      exportedAt: new Date().toISOString(),
      documents,
      categories,
      tags,
      settings,
    };
  }

  async importData(data) {
    await this._ensureReady();
    validateBackupData(data);

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(BACKUP_STORES, 'readwrite');

      transaction.oncomplete = () => {
        this.rebuildTaxonomy()
          .then(() => {
            notifyDocumentsChanged();
            resolve();
          })
          .catch(reject);
      };
      transaction.onerror = () => reject(transaction.error || new Error('Backup could not be restored.'));

      BACKUP_STORES.forEach((storeName) => {
        const store = transaction.objectStore(storeName);
        store.clear();

        (data[storeName] || []).forEach((record) => {
          if (store.keyPath) {
            store.put(record);
          } else {
            store.put(record, record.id || record.key);
          }
        });
      });
    });
  }

  async clearAllData() {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(BACKUP_STORES, 'readwrite');

      transaction.oncomplete = () => {
        this.ensureDefaultCategories()
          .then(() => {
            notifyDocumentsChanged();
            resolve();
          })
          .catch(reject);
      };
      transaction.onerror = () => reject(transaction.error || new Error('Local data could not be cleared.'));

      BACKUP_STORES.forEach((storeName) => {
        transaction.objectStore(storeName).clear();
      });
    });
  }

  async getDatabaseSize() {
    await this._ensureReady();

    return new Promise((resolve, reject) => {
      const request = indexedDB.databases();

      request.onsuccess = () => {
        const databases = request.result;
        const dbInfo = databases.find(db => db.name === DB_NAME);
        resolve(dbInfo?.size || 0);
      };

      request.onerror = (error) => reject(error);
    });
  }
}

// Export singleton instance
export const knowledgeDB = new KnowledgeDB();
