import jwt from 'jsonwebtoken';

export const AUTH_COOKIE_NAME = 'token';

const AUTH_TOKEN_MAX_AGE_SECONDS = 60 * 60;

export const authCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: AUTH_TOKEN_MAX_AGE_SECONDS,
};

function getTokenFromAuthorizationHeader(request) {
  const authorizationHeader = request.headers.get('authorization');
  if (!authorizationHeader) {
    return null;
  }

  if (!authorizationHeader.startsWith('Bearer ')) {
    return null;
  }

  return authorizationHeader.slice('Bearer '.length).trim();
}

export function getRequestToken(request) {
  const headerToken = getTokenFromAuthorizationHeader(request);
  if (headerToken) {
    return headerToken;
  }

  return request.cookies.get(AUTH_COOKIE_NAME)?.value || null;
}

export function verifyRequestToken(request) {
  const token = getRequestToken(request);

  if (!token) {
    return { error: 'Token não fornecido.', status: 401 };
  }

  try {
    const usuario = jwt.verify(token, process.env.JWT_SECRET);
    return { usuario, status: 200 };
  } catch {
    return { error: 'Token inválido.', status: 401 };
  }
}
