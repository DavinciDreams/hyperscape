const POINTER_FOCUS_RELEASE_SELECTOR =
  'button,[role="button"],[role="tab"],[aria-pressed]';

const POINTER_FOCUS_EXCLUDE_SELECTOR =
  'input,textarea,select,[contenteditable="true"],[data-allow-pointer-focus="true"]';

export function getPointerFocusedControl(
  target: EventTarget | null,
): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  if (target.closest(POINTER_FOCUS_EXCLUDE_SELECTOR)) {
    return null;
  }

  return target.closest<HTMLElement>(POINTER_FOCUS_RELEASE_SELECTOR);
}
