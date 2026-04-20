import { describe, it, expect } from 'vitest';
import { RenderPipeline } from '@/rendering/render-pipeline';
import type { RenderDeps } from '@/rendering/render-pipeline';

function createMockDeps(): RenderDeps {
  return {
    renderer: {} as any,
    projection: {} as any,
    pathGen: {} as any,
    dsoManager: {} as any,
    alertSystem: {} as any,
    alertSiteEl: null,
    alertPrecEl: null,
    frame: {} as any,
  };
}

describe('RenderPipeline', () => {
  it('executes enabled layers in order', () => {
    const pipeline = new RenderPipeline();
    const order: string[] = [];
    const mockState = {} as any;

    pipeline.addLayer({
      name: 'a',
      enabled: () => true,
      render: () => order.push('a'),
    });
    pipeline.addLayer({
      name: 'b',
      enabled: () => true,
      render: () => order.push('b'),
    });
    pipeline.addLayer({
      name: 'c',
      enabled: () => true,
      render: () => order.push('c'),
    });

    pipeline.execute({} as any, mockState, createMockDeps());
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('skips disabled layers', () => {
    const pipeline = new RenderPipeline();
    const order: string[] = [];
    const mockState = {} as any;

    pipeline.addLayer({
      name: 'a',
      enabled: () => true,
      render: () => order.push('a'),
    });
    pipeline.addLayer({
      name: 'b',
      enabled: () => false,
      render: () => order.push('b'),
    });
    pipeline.addLayer({
      name: 'c',
      enabled: () => true,
      render: () => order.push('c'),
    });

    pipeline.execute({} as any, mockState, createMockDeps());
    expect(order).toEqual(['a', 'c']);
  });

  it('passes ctx, state, and deps to each layer', () => {
    const pipeline = new RenderPipeline();
    const mockCtx = {} as any;
    const mockState = { test: true } as any;
    const mockDeps = createMockDeps();
    let receivedCtx: any;
    let receivedState: any;
    let receivedDeps: any;

    pipeline.addLayer({
      name: 'test',
      enabled: () => true,
      render: (ctx, state, deps) => {
        receivedCtx = ctx;
        receivedState = state;
        receivedDeps = deps;
      },
    });

    pipeline.execute(mockCtx, mockState, mockDeps);
    expect(receivedCtx).toBe(mockCtx);
    expect(receivedState).toBe(mockState);
    expect(receivedDeps).toBe(mockDeps);
  });

  it('handles empty pipeline', () => {
    const pipeline = new RenderPipeline();
    expect(() => pipeline.execute({} as any, {} as any, createMockDeps())).not.toThrow();
  });

  it('layer enabled receives state', () => {
    const pipeline = new RenderPipeline();
    const mockState = { visible: true } as any;
    let enabledState: any;

    pipeline.addLayer({
      name: 'test',
      enabled: (state) => { enabledState = state; return true; },
      render: () => {},
    });

    pipeline.execute({} as any, mockState, createMockDeps());
    expect(enabledState).toBe(mockState);
  });
});