// Smoothly scrolls the main content area back to the top.
// Used whenever the user clicks a navigation link.
export function scrollContentToTop() {
  const contentEl = document.getElementById('app-content');
  if (contentEl) {
    contentEl.scrollTo({ top: 0, behavior: 'smooth' });
  }
}