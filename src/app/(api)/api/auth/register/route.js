import { errorResponse } from '@/lib/apiErrors';

export async function POST() {
  return errorResponse('AUTH_REGISTER_DISABLED');
}
