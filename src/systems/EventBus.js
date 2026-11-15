/**
 * Minimal publish/subscribe bus used to decouple the simulation engine from
 * rendering and UI code.
 *
 * Design notes
 * - `on()` returns an unsubscribe function, which keeps cleanup code short.
 * - Listener lists are copy-on-write, so `emit()` allocates nothing and it is
 *   safe to add/remove listeners from inside a handler. A listener removed
 *   during an emit will not be called later in that same emit.
 * - A throwing handler never prevents other handlers from running. The error
 *   is logged to the console (never swallowed) and forwarded to the optional
 *   `onHandlerError` hook.
 */
export class EventBus {
  /**
   * @param {{ onHandlerError?: (error: unknown, eventName: string) => void }} [options]
   */
  constructor({ onHandlerError = null } = {}) {
    /** @type {Map<string, Array<{handler: Function, context: any, once: boolean, active: boolean}>>} */
    this._listeners = new Map();
    this._onHandlerError = onHandlerError;
  }

  /**
   * Register a listener.
   * @param {string} eventName
   * @param {Function} handler
   * @param {any} [context] `this` value used when the handler is called.
   * @returns {() => void} Function that removes this listener.
   */
  on(eventName, handler, context = undefined) {
    return this._add(eventName, handler, context, false);
  }

  /** Like `on()`, but the listener removes itself after its first call. */
  once(eventName, handler, context = undefined) {
    return this._add(eventName, handler, context, true);
  }

  /**
   * Remove a listener previously added with `on()`/`once()`.
   * @returns {boolean} True if a listener was removed.
   */
  off(eventName, handler, context = undefined) {
    const list = this._listeners.get(eventName);
    if (!list) return false;
    const entry = list.find(
      (e) => e.handler === handler && (context === undefined || e.context === context),
    );
    if (!entry) return false;
    this._remove(eventName, entry);
    return true;
  }

  /**
   * Call every listener of `eventName` with `payload`.
   * @returns {number} Number of listeners that were invoked.
   */
  emit(eventName, payload = undefined) {
    const list = this._listeners.get(eventName);
    if (!list) return 0;
    let called = 0;
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (!entry.active) continue;
      if (entry.once) this._remove(eventName, entry);
      called++;
      try {
        entry.handler.call(entry.context, payload);
      } catch (error) {
        console.error(`[EventBus] Handler for "${eventName}" threw:`, error);
        if (this._onHandlerError && eventName !== 'app:error') {
          try {
            this._onHandlerError(error, eventName);
          } catch (hookError) {
            console.error('[EventBus] onHandlerError hook threw:', hookError);
          }
        }
      }
    }
    return called;
  }

  /** Remove all listeners for one event, or for every event when omitted. */
  clear(eventName = undefined) {
    if (eventName === undefined) {
      for (const list of this._listeners.values()) for (const e of list) e.active = false;
      this._listeners.clear();
      return;
    }
    const list = this._listeners.get(eventName);
    if (list) for (const e of list) e.active = false;
    this._listeners.delete(eventName);
  }

  /** Number of active listeners for an event (useful in tests and leak checks). */
  listenerCount(eventName) {
    return this._listeners.get(eventName)?.length ?? 0;
  }

  _add(eventName, handler, context, once) {
    if (typeof eventName !== 'string' || eventName.length === 0) {
      throw new TypeError('EventBus: event name must be a non-empty string.');
    }
    if (typeof handler !== 'function') {
      throw new TypeError(`EventBus: handler for "${eventName}" must be a function.`);
    }
    const entry = { handler, context, once, active: true };
    const current = this._listeners.get(eventName);
    this._listeners.set(eventName, current ? [...current, entry] : [entry]);
    return () => this._remove(eventName, entry);
  }

  _remove(eventName, entry) {
    entry.active = false;
    const list = this._listeners.get(eventName);
    if (!list) return;
    const next = list.filter((e) => e !== entry);
    if (next.length === 0) this._listeners.delete(eventName);
    else this._listeners.set(eventName, next);
  }
}
