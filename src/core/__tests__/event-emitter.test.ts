import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from '@/core/event-emitter';

describe('EventEmitter', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  it('calls registered handler on emit', () => {
    const calls: string[] = [];
    emitter.on('redraw', () => calls.push('fired'));
    emitter.emit('redraw');
    expect(calls).toEqual(['fired']);
  });

  it('passes data to handler', () => {
    let received: { zoomK: number } | undefined;
    emitter.on('viewport:zoom', (data) => { received = data; });
    emitter.emit('viewport:zoom', { zoomK: 1.5 });
    expect(received).toEqual({ zoomK: 1.5 });
  });

  it('supports multiple handlers for the same event', () => {
    const calls: number[] = [];
    emitter.on('redraw', () => calls.push(1));
    emitter.on('redraw', () => calls.push(2));
    emitter.emit('redraw');
    expect(calls).toEqual([1, 2]);
  });

  it('returns unsubscribe function from on()', () => {
    const calls: number[] = [];
    const unsub = emitter.on('redraw', () => calls.push(1));
    unsub();
    emitter.emit('redraw');
    expect(calls).toEqual([]);
  });

  it('removes specific handler with off()', () => {
    const calls: number[] = [];
    const handler = () => calls.push(1);
    emitter.on('redraw', handler);
    emitter.off('redraw', handler);
    emitter.emit('redraw');
    expect(calls).toEqual([]);
  });

  it('removeAllListeners clears all handlers', () => {
    const calls: string[] = [];
    emitter.on('redraw', () => calls.push('a'));
    emitter.on('viewport:zoom', () => calls.push('b'));
    emitter.removeAllListeners();
    emitter.emit('redraw');
    emitter.emit('viewport:zoom');
    expect(calls).toEqual([]);
  });

  it('removeAllListeners for specific event only', () => {
    const calls: string[] = [];
    emitter.on('redraw', () => calls.push('a'));
    emitter.on('viewport:zoom', () => calls.push('b'));
    emitter.removeAllListeners('redraw');
    emitter.emit('redraw');
    emitter.emit('viewport:zoom', { zoomK: 1 });
    expect(calls).toEqual(['b']);
  });

  it('does nothing when emitting event with no handlers', () => {
    expect(() => emitter.emit('redraw')).not.toThrow();
  });

  it('supports untyped string events', () => {
    let received: { tz: string } | undefined;
    emitter.on<{ tz: string }>('timezone:changed', (data) => { received = data; });
    emitter.emit('timezone:changed', { tz: 'Europe/Paris' });
    expect(received).toEqual({ tz: 'Europe/Paris' });
  });
});