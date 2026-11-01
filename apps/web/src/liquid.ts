/**
 * Liquid Glass press feedback.
 *
 * Adds a soft specular bloom at the pointer position inside any glass control
 * (buttons, segmented items, tabs, menu rows, palette cards). Purely visual:
 * the ripple never intercepts pointer events and honours reduced motion.
 */
const SELECTOR = '.btn, .segmented-item, .mobile-tab, .menu-action, .palette-item';

export function installLiquidPress(): void {
  if (typeof window === 'undefined') return;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0 || reduced()) return;
      const target = event.target as HTMLElement | null;
      const host = target?.closest<HTMLElement>(SELECTOR);
      if (!host) return;
      if (host.hasAttribute('disabled') || host.getAttribute('aria-disabled') === 'true') return;

      const rect = host.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const size = Math.max(rect.width, rect.height) * 1.7;
      const ripple = document.createElement('span');
      ripple.className = 'liquid-ripple';
      ripple.setAttribute('aria-hidden', 'true');
      ripple.style.setProperty('--rx', `${event.clientX - rect.left}px`);
      ripple.style.setProperty('--ry', `${event.clientY - rect.top}px`);
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;

      host.appendChild(ripple);
      host.classList.add('is-liquid-pressed');
      window.setTimeout(() => host.classList.remove('is-liquid-pressed'), 170);
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
      window.setTimeout(() => ripple.remove(), 900);
    },
    { passive: true },
  );
}
