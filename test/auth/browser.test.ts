import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { htmlPage, bindServer } from '../../src/auth/browser.js';

describe('htmlPage', () => {
  it('returns valid HTML with title and message', () => {
    const html = htmlPage('Success', 'You are logged in.');
    expect(html).toContain('<h2>Success</h2>');
    expect(html).toContain('<p>You are logged in.</p>');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('escapes HTML special characters in title', () => {
    const html = htmlPage('<script>alert("xss")</script>', 'Safe message');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('escapes HTML special characters in message', () => {
    const html = htmlPage('Title', '<img onerror="alert(1)" src=x>');
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('&lt;img onerror=&quot;alert(1)&quot; src=x&gt;');
  });

  it('escapes ampersands and single quotes', () => {
    const html = htmlPage("Tom & Jerry's", 'A & B');
    expect(html).toContain('Tom &amp; Jerry&#39;s');
    expect(html).toContain('A &amp; B');
  });

  it('includes auto-close script', () => {
    const html = htmlPage('Done', 'Close this tab.');
    expect(html).toContain('<script>window.close()</script>');
  });
});

describe('bindServer', () => {
  it('binds to a port from the callback range', async () => {
    const server = createServer();
    const port = await bindServer(server);
    expect(port).toBeGreaterThanOrEqual(18484);
    expect(port).toBeLessThanOrEqual(18489);
    server.close();
  });

  it('skips occupied ports and binds to the next available', async () => {
    const blocker = createServer();
    // Occupy the first port
    await new Promise<void>((resolve) => {
      blocker.listen(18484, '127.0.0.1', resolve);
    });

    try {
      const server = createServer();
      const port = await bindServer(server);
      expect(port).toBeGreaterThan(18484);
      expect(port).toBeLessThanOrEqual(18489);
      server.close();
    } finally {
      blocker.close();
    }
  });
});
