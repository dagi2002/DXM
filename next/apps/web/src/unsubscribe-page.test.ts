import { describe, expect, it, vi } from 'vitest';
import { mount } from './unsubscribe-page';

const TOKEN = 'a'.repeat(16) + 'B'.repeat(16);

function setup(lang: 'en' | 'am', token = TOKEN, status = 200) {
  const root = document.createElement('div');
  const fetchImpl = vi.fn(async () => new Response('{}', { status })) as unknown as typeof fetch;
  mount(root, token, lang, fetchImpl);
  return { root, fetchImpl };
}

describe('Monday email unsubscribe page', () => {
  it('changes nothing until the person confirms, then posts the one-click endpoint', async () => {
    const { root, fetchImpl } = setup('en');
    expect(root.querySelector('h1')!.textContent).toBe('Stop the Monday email?');
    expect(fetchImpl).not.toHaveBeenCalled();
    root.querySelector('button')!.click();
    await vi.waitFor(() => expect(root.textContent).toContain('Done.'));
    expect(fetchImpl).toHaveBeenCalledWith(`/api/v1/public/digest/unsubscribe/${TOKEN}`, {
      method: 'POST',
      credentials: 'omit',
    });
  });

  it('speaks Amharic, and says when a link is no longer valid', async () => {
    const { root } = setup('am', TOKEN, 404);
    expect(root.querySelector('h1')!.textContent).toBe('የሰኞ ኢሜይሉን ማቆም ይፈልጋሉ?');
    root.querySelector('button')!.click();
    await vi.waitFor(() => expect(root.textContent).toContain('ይህ ሊንክ ከእንግዲህ አይሠራም'));
  });

  it('never calls the API with a malformed token', () => {
    const { root, fetchImpl } = setup('en', '../../api/v1/me');
    expect(root.querySelector('button')).toBeNull();
    expect(root.textContent).toContain('isn’t valid');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
