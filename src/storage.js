// IndexedDB wrapper for local data storage
const DB_NAME = 'knowledge-app-db';
const STORE_NAME = 'documents';
const VERSION = 1;

class KnowledgeStorage {
  constructor() {
    this.db = null;
    this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, VERSION);
      
      request.onupgraded = (event) => {
        const db = event.target.result;
        
        // Create object stores if they don't exist
        if (!db.objectStores.has(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, 'id');
          store.createIndex('tags');
          store.createIndex('category');
          store.createIndex('lastModified');
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve();
      };

      request.onerror = (error) => {
        reject(error);
      };
    });
  }

  async addDocument(document) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      document.lastModified = Date.now();
      document.createdAt = document.createdAt || Date.now();
      
      const request = store.add(document);
      
      request.onsuccess = () => {
        resolve(document.id);
      };

      request.onerror = (error) => {
        reject(error);
      };
    });
  }

  async getDocument(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.get(id);
      
      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (error) => {
        reject(error);
      };
    });
  }

  async updateDocument(id, updates) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.get(id);
      
      request.onsuccess = (event) => {
        if (!event.target.result) {
          reject(new Error('Document not found'));
          return;
        }

        const updatedDoc = { ...event.target.result, ...updates };
        updatedDoc.lastModified = Date.now();
        
        const updateRequest = store.put(updatedDoc);
        
        updateRequest.onsuccess = () => {
          resolve(updatedDoc);
        };

        updateRequest.onerror = (error) => {
          reject(error);
        };
      };

      request.onerror = (error) => {
        reject(error);
      };
    });
  }

  async deleteDocument(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.delete(id);
      
      request.onsuccess = () => {
        resolve();
      };

      request.onerror = (error) => {
        reject(error);
      };
    });
  }

  async getAllDocuments() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      
      const request = store.getAll();
      
      request.onsuccess = (event) => {
        resolve(event.target.result || []);
      };

      request.onerror = (error) => {
        reject(error);
      };
    });
  }

  async searchDocuments(query) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      
      // Simple text search implementation
      const request = store.getAll();
      
      request.onsuccess = (event) => {
        const documents = event.target.result || [];
        const searchTerm = query.toLowerCase();
        
        const filteredDocs = documents.filter(doc => 
          doc.title?.toLowerCase().includes(searchTerm) ||
          doc.content?.toLowerCase().includes(searchTerm) ||
          doc.tags?.some(tag => tag.toLowerCase().includes(searchTerm))
        );
        
        resolve(filteredDocs);
      };

      request.onerror = (error) => {
        reject(error);
      };
    });
  }

  async clearAllData() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      
      request.onsuccess = () => {
        resolve();
      };

      request.onerror = (error) => {
        reject(error);
      };
    });
  }
}

export default new KnowledgeStorage();