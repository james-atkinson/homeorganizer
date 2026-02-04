import { ref } from 'vue';

/** Reactive fatal error message. When set, the error overlay is shown. */
export const fatalError = ref(null);

/**
 * Report a serious error to show in the global overlay.
 * Use only when all else has failed (e.g. app cannot function).
 * @param {string|Error} messageOrError
 */
export function setFatalError(messageOrError) {
  const msg =
    messageOrError instanceof Error
      ? messageOrError.message || String(messageOrError)
      : String(messageOrError);
  fatalError.value = msg || 'An unexpected error occurred';
}

export function clearFatalError() {
  fatalError.value = null;
}
