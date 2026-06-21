import { useEffect, useRef } from 'react';

function useScreenFocus() {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return headingRef;
}

export default useScreenFocus;
