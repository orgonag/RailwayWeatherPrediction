// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AIBrief from '../src/components/AIBrief';

afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('keeps an assessment current across clock ticks but flags changed source evidence',async()=>{
  vi.stubEnv('VITE_AI_ENDPOINT','https://gateway.example');
  const context={generatedAt:'2026-04-22T12:00:00Z',selectedSample:{id:'birch'},gauges:[{station:'05MA011',levelM:540}]};
  vi.stubGlobal('fetch',async()=>Response.json({
    text:'Review Birch Creek rising water.',
    metadata:{engineKind:'reasoning',model:'model-snapshot',reasoningEffort:'high',generatedAt:'2026-04-22T12:02:00Z',evidenceAsOf:'2026-04-22T12:00:00Z',evidenceSha256:'a'.repeat(64),responseId:'resp_test'}
  }));
  const rendered=render(<AIBrief context={context}/>);
  const generate=screen.getByRole('button',{name:'Generate AI assessment'}) as HTMLButtonElement;
  expect(generate.disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(generate.disabled).toBe(false);
  fireEvent.click(generate);
  await screen.findByText('Review Birch Creek rising water.');
  rendered.rerender(<AIBrief context={{...context,generatedAt:'2026-04-22T12:01:00Z'}}/>);
  expect(screen.queryByRole('status')).toBeNull();
  rendered.rerender(<AIBrief context={{...context,gauges:[{station:'05MA011',levelM:541}]}}/>);
  expect(screen.getByRole('status').textContent).toMatch(/earlier or different evidence/i);
});
