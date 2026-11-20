/** Phones and tablets get the mobile budgets (Art Bible 10.4, 10.11, 10.13: fewer lights and particles). */
export function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches === true && navigator.maxTouchPoints > 0;
}
