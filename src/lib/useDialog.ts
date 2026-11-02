import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

interface DialogOptions {
  onClose: () => void;
  /** Mount/unmount switch for dialogs that stay in the tree while closed. */
  active?: boolean;
  /** Modal dialogs trap Tab and make the rest of the page inert; non-modal panels only handle Escape and focus return. */
  modal?: boolean;
}

/**
 * Focus management for dialogs: initial focus, Tab trap, Escape to close, inert background,
 * and focus return. Attach the returned ref to the dialog container.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>({ onClose, active = true, modal = true }: DialogOptions) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    if (!active || !node) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('disabled'));

    // Everything outside the dialog becomes inert, except live regions marked data-keep-active.
    const inerted: HTMLElement[] = [];
    if (modal) {
      let el: HTMLElement | null = node;
      while (el?.parentElement && el.id !== 'root') {
        for (const sibling of Array.from(el.parentElement.children) as HTMLElement[]) {
          if (sibling !== el && !sibling.hasAttribute('data-keep-active') && !sibling.inert) {
            sibling.inert = true;
            inerted.push(sibling);
          }
        }
        el = el.parentElement;
      }
    }

    (focusables()[0] ?? node).focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (!modal || event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (!node.contains(current)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      inerted.forEach((el) => { el.inert = false; });
      if (previous?.isConnected) previous.focus();
    };
  }, [active, modal]);

  return ref;
}
