/**
 * Tiny hash router — keeps the app dependency-free and works from any
 * static path (GitHub Pages subdirectory, file://, etc.).
 */
import { useEffect, useState } from 'react';

export function currentRoute(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h || '/overview';
}

export function useRoute(): string {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(route: string) {
  window.location.hash = route;
}
