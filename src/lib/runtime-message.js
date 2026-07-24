/** Send a runtime message without surfacing channel-closed / context-invalidated errors. */
export function sendRuntimeMessage(message, onResponse) {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;

  try {
    const promise = chrome.runtime.sendMessage(
      message,
      onResponse
        ? (response) => {
          if (chrome.runtime.lastError) return;
          onResponse(response);
        }
        : undefined,
    );
    promise?.catch?.(() => {});
  } catch {
    /* extension context invalidated */
  }
}