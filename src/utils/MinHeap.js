/**
 * Binary min-heap of (key, integer value) pairs stored in typed arrays, so a
 * 512x512 priority-flood needs no per-item allocation.
 */
export class MinHeap {
  /** @param {number} capacity Maximum number of items held at once. */
  constructor(capacity) {
    this._keys = new Float64Array(capacity);
    this._vals = new Int32Array(capacity);
    this.size = 0;
    /** Key of the item returned by the last pop(). */
    this.lastKey = 0;
  }

  push(key, value) {
    const keys = this._keys;
    const vals = this._vals;
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent];
      vals[i] = vals[parent];
      i = parent;
    }
    keys[i] = key;
    vals[i] = value;
  }

  /** Remove and return the value with the smallest key. */
  pop() {
    const keys = this._keys;
    const vals = this._vals;
    const top = vals[0];
    this.lastKey = keys[0];
    const n = --this.size;
    if (n > 0) {
      const key = keys[n];
      const val = vals[n];
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && keys[child + 1] < keys[child]) child++;
        if (keys[child] >= key) break;
        keys[i] = keys[child];
        vals[i] = vals[child];
        i = child;
      }
      keys[i] = key;
      vals[i] = val;
    }
    return top;
  }
}
