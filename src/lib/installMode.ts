export const isStandaloneApp = (): boolean => typeof window !== 'undefined' && (
  window.matchMedia?.('(display-mode: standalone)').matches
  || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
);

export const isMobileBrowser = (): boolean => typeof navigator !== 'undefined'
  && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
  && !isStandaloneApp();

export const isAppleMobile = (): boolean => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
