export const AUTH_CHANGED_EVENT = 'erp:auth-changed';

export function notifyAuthChanged(detail = {}) {
  window.dispatchEvent(
    new CustomEvent(AUTH_CHANGED_EVENT, {
      detail
    })
  );
}
