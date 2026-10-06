import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

export const currentUserFactory = (
  _data: unknown,
  ctx: ExecutionContext,
): AuthenticatedUser =>
  ctx.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>().user;

/** Inyecta el usuario autenticado en el handler. */
export const CurrentUser = createParamDecorator(currentUserFactory);
