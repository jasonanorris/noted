import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import HomeScreen from './components/HomeScreen';

function lazyWithPreload(importer) {
  const Component = lazy(importer);
  Component.preload = importer;
  return Component;
}

const EditorScreen = lazyWithPreload(() => import('./components/EditorScreen'));
const ImportScreen = lazyWithPreload(() => import('./components/ImportScreen'));
const SearchScreen = lazyWithPreload(() => import('./components/SearchScreen'));
const SettingsScreen = lazyWithPreload(() => import('./components/SettingsScreen'));
const deferredScreens = [EditorScreen, ImportScreen, SearchScreen, SettingsScreen];
const THEME_STORAGE_KEY = 'noted:theme';

const viewTitles = {
  home: 'Knowledge Storage',
  editor: 'Note Editor',
  search: 'Search',
  import: 'Import',
  settings: 'Settings',
};

function getInitialView() {
  const view = window.history.state?.view || window.location.hash.replace('#', '');

  return viewTitles[view] ? view : 'home';
}

function getInitialTheme() {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'dark' || storedTheme === 'light') return storedTheme;
  } catch (error) {
    // Theme preference is cosmetic; fall back quietly.
  }

  return 'light';
}

function ViewLoadingFallback() {
  return (
    <main id="main-content" className="app-view" tabIndex="-1">
      <div className="document-state route-loading-state" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <strong>Loading view</strong>
        <span>Preparing your workspace.</span>
      </div>
    </main>
  );
}

class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Route could not load:', error);
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main id="main-content" className="app-view" tabIndex="-1">
        <div className="document-state is-error route-loading-state" role="alert">
          <strong>View could not load.</strong>
          <span>Go back home and try again.</span>
          <button className="text-button" type="button" onClick={this.props.onReset}>
            Go Home
          </button>
        </div>
      </main>
    );
  }
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
    const publicUrl = process.env.PUBLIC_URL || '';
    const isPublicPath = publicUrl && window.location.pathname.startsWith(publicUrl);
    const serviceWorkerUrl = isLocalhost && !isPublicPath ? '/sw.js' : `${publicUrl}/sw.js`;

    navigator.serviceWorker.register(serviceWorkerUrl).then((registration) => {
      console.log('Service worker registered:', registration);
      registration.update();
    }).catch((error) => {
      console.error('Service worker registration failed:', error);
    });
  });
}

function App() {
  const [activeView, setActiveView] = useState(getInitialView);
  const [activeDocument, setActiveDocument] = useState(null);
  const [theme, setTheme] = useState(getInitialTheme);

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

  useEffect(() => {
    document.documentElement.classList.toggle('dark-theme', theme === 'dark');

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      // Theme preference should not block app usage.
    }
  }, [theme]);

  useEffect(() => {
    const preloadScreens = () => {
      deferredScreens.forEach((Screen) => Screen.preload());
    };

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(preloadScreens);
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(preloadScreens, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

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
      return <ImportScreen onBack={() => navigate('settings')} />;
    }

    return (
      <SettingsScreen
        onBack={() => navigate('home')}
        onImport={() => navigate('import')}
        theme={theme}
        onThemeChange={setTheme}
      />
    );
  }, [
    activeDocument,
    activeView,
    handleSavedDocument,
    navigate,
    openDocument,
    startNewDocument,
    theme,
  ]);

  return (
    <div className="App">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <RouteErrorBoundary resetKey={activeView} onReset={() => navigate('home')}>
        <Suspense fallback={<ViewLoadingFallback />}>
          {currentView}
        </Suspense>
      </RouteErrorBoundary>
    </div>
  );
}

export default App;
