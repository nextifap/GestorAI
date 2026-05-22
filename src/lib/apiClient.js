export async function readApiError(response) {
  if (!response) {
    return null;
  }

  const data = await response.json().catch(() => ({}));
  if (data?.error && typeof data.error === 'object') {
    return {
      code: data.error.code,
      message: data.error.message,
      details: data.error.details,
    };
  }

  if (typeof data?.error === 'string') {
    return { message: data.error };
  }

  return null;
}

export async function getApiErrorMessage(response, fallbackMessage) {
  const apiError = await readApiError(response);
  return apiError?.message || fallbackMessage;
}
