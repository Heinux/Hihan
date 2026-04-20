import type { WindGrid } from '@/data/wind-grid';

export interface AppEvents {
  'redraw': void;
  'time:changed': { jd: number };
  'viewport:zoom': { zoomK: number };
  'viewport:pan': { panX: number; panY: number };
  'body:hovered': { bodyId: string | null };
  'hemisphere:changed': { hem: 'N' | 'S' };
  'wind:loaded': { grid: WindGrid };
  'wind:error': { error: Error };
}

type EventHandler<T = unknown> = (data: T) => void;

export class EventEmitter {
  #handlers = new Map<string, Set<EventHandler<any>>>();

  on<K extends keyof AppEvents>(event: K, handler: EventHandler<AppEvents[K]>): () => void;
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void;
  on(event: string, handler: EventHandler<any>): () => void {
    if (!this.#handlers.has(event)) {
      this.#handlers.set(event, new Set());
    }
    this.#handlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: EventHandler<any>): void {
    this.#handlers.get(event)?.delete(handler);
  }

  emit<K extends keyof AppEvents>(event: K, data?: AppEvents[K]): void;
  emit<T = unknown>(event: string, data?: T): void;
  emit(event: string, data?: unknown): void {
    this.#handlers.get(event)?.forEach(h => h(data));
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.#handlers.delete(event);
    } else {
      this.#handlers.clear();
    }
  }
}
