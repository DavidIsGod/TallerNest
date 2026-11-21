import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { obtenerRequest } from '../utils/request.util';

export const currentUserFactory = (
  _data: unknown,
  ctx: ExecutionContext,
): AuthenticatedUser => obtenerRequest<{ user: AuthenticatedUser }>(ctx).user;

/** Inyecta el usuario autenticado en el handler (controlador o resolver). */
export const CurrentUser = createParamDecorator(currentUserFactory);
