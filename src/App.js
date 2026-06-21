import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import EditorScreen from './components/EditorScreen';
import HomeScreen from './components/HomeScreen';
import ImportScreen from './components/ImportScreen';
import SearchScreen from './components/SearchScreen';
import SettingsScreen from './components/SettingsScreen';

const viewTitles = {
  home: 'Knowledge Storage',
  editor: 'Document Editor',
  search: 'Search',
  import: 'Import',
  settings: 'Settings',
};

function getInitialView() {
  const view = window.history.state?.view || window.location.hash.replace('#', '');

  return viewTitles[view] ? view : 'home';
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      console.log('Service worker registered:', registration);

      // Check for updates
      if (registration.updateAvailable) {
        registration.updateAvailable();
      }
    }).catch((error) => {
      console.error('Service worker registration failed:', error);
    });
  });
}

function App() {
  const [activeView, setActiveView] = useState(getInitialView);
  const [activeDocument, setActiveDocument] = useState(null);

  const navigate = useCallback((view, options = {}) => {
    const nextView = viewTitles[view] ? view : 'home';
    const shouldReplace = options.replace || nextView === activeView;

    setActiveView(nextView);

    if (nextView !== 'editor') {
      setActiveDocument(null);
    }

    const historyMethod = shouldReplace ? 'replaceState' : 'pushState';
    window.history[historyMethod]({ view: nextView }, '', `#${nextView}`);
  }, [activeView]);

  const openDocument = useCallback((document) => {
    setActiveDocument(document);
    navigate('editor');
  }, [navigate]);

  const startNewDocument = useCallback(() => {
    setActiveDocument(null);
    navigate('editor');
  }, [navigate]);

  const handleSavedDocument = useCallback((document) => {
    setActiveDocument(document);
  }, []);

  useEffect(() => {
    if (!window.history.state?.view) {
      window.history.replaceState({ view: activeView }, '', `#${activeView}`);
    }

    const handlePopState = (event) => {
      const view = event.state?.view || window.location.hash.replace('#', '') || 'home';
      const nextView = viewTitles[view] ? view : 'home';
      setActiveView(nextView);

      if (nextView !== 'editor') {
        setActiveDocument(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeView]);

  useEffect(() => {
    document.title = `Noted - ${viewTitles[activeView]}`;
  }, [activeView]);

  const currentView = useMemo(() => {
    if (activeView === 'home') {
      return (
        <HomeScreen
          onNavigate={navigate}
          onNewDocument={startNewDocument}
          onOpenDocument={openDocument}
        />
      );
    }

    if (activeView === 'editor') {
      return (
        <EditorScreen
          document={activeDocument}
          onBack={() => navigate('home')}
          onSaved={handleSavedDocument}
        />
      );
    }

    if (activeView === 'search') {
      return <SearchScreen onBack={() => navigate('home')} onOpenDocument={openDocument} />;
    }

    if (activeView === 'import') {
      return <ImportScreen onBack={() => navigate('home')} />;
    }

    return <SettingsScreen onBack={() => navigate('home')} />;
  }, [
    activeDocument,
    activeView,
    handleSavedDocument,
    navigate,
    openDocument,
    startNewDocument,
  ]);

  return (
    <div className="App">
      {currentView}
    </div>
  );
}

export default App;
