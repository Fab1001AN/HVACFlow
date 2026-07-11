import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public, bypassing JWT authentication.
 * Used on /auth/login and /auth/refresh.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
