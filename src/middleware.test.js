import { beforeEach, describe, expect, it, vi } from 'vitest';

const jwtVerifyMock = vi.fn();

const redirectMock = vi.fn((url) => {
  const cookieSet = vi.fn();
  return {
    type: 'redirect',
    url: url.toString(),
    cookies: { set: cookieSet },
  };
});

const nextMock = vi.fn(() => ({ type: 'next' }));

vi.mock('jose', () => ({
  jwtVerify: (...args) => jwtVerifyMock(...args),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    redirect: (...args) => redirectMock(...args),
    next: (...args) => nextMock(...args),
  },
}));

import { middleware } from './middleware';

function buildRequest({ pathname, token }) {
  return {
    nextUrl: { pathname },
    url: `http://localhost${pathname}`,
    cookies: {
      get: (name) => (name === 'token' && token ? { value: token } : undefined),
    },
  };
}

describe('middleware routing stability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
  });

  it('redirects authenticated user away from public login route', async () => {
    jwtVerifyMock.mockResolvedValue({});

    const response = await middleware(buildRequest({ pathname: '/login', token: 'valid-token' }));

    expect(redirectMock).toHaveBeenCalledOnce();
    expect(response.url).toBe('http://localhost/dashboard');
  });

  it('redirects unauthenticated user from private route to login', async () => {
    const response = await middleware(buildRequest({ pathname: '/dashboard' }));

    expect(redirectMock).toHaveBeenCalledOnce();
    expect(response.url).toBe('http://localhost/login');
  });

  it('clears invalid auth cookie when redirecting to login', async () => {
    jwtVerifyMock.mockRejectedValue(new Error('invalid token'));

    const response = await middleware(buildRequest({ pathname: '/dashboard', token: 'stale-token' }));

    expect(response.url).toBe('http://localhost/login');
    expect(response.cookies.set).toHaveBeenCalledWith('token', '', { maxAge: 0, path: '/' });
  });

  it('allows unauthenticated access to public routes', async () => {
    const response = await middleware(buildRequest({ pathname: '/cadastro' }));

    expect(nextMock).toHaveBeenCalledOnce();
    expect(response).toEqual({ type: 'next' });
  });
});
