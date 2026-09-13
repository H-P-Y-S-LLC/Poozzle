/**
 * Minimal strongly-typed event bus (no Redux, aligned with UE delegates).
 * Spec: Documents/ThreeJsWebPortDevDoc.md §1.3, Appendix B.
 */
export type EventMap = Record<string, unknown>;

type Handler<T> = (payload: T) => void;

interface Subscription<T> {
  handler: Handler<T>;
  once: boolean;
}

export class EventBus<Events extends EventMap = EventMap> {
  private subs = new Map<keyof Events, Set<Subscription<unknown>>>();

  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    return this.add(type, handler, false);
  }

  once<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    return this.add(type, handler, true);
  }

  private add<K extends keyof Events>(type: K, handler: Handler<Events[K]>, once: boolean): () => void {
    let set = this.subs.get(type);
    if (!set) {
      set = new Set();
      this.subs.set(type, set);
    }
    const sub: Subscription<Events[K]> = { handler, once };
    set.add(sub as Subscription<unknown>);
    return () => set!.delete(sub as Subscription<unknown>);
  }

  off<K extends keyof Events>(type: K, handler: Handler<Events[K]>): void {
    this.subs.get(type)?.delete({ handler, once: false } as unknown as Subscription<unknown>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.subs.get(type);
    if (!set || set.size === 0) return;
    // copy to allow mutation during emit
    for (const sub of [...set]) {
      (sub.handler as Handler<Events[K]>)(payload);
      if (sub.once) set.delete(sub);
    }
  }

  clear(): void {
    this.subs.clear();
  }
}
