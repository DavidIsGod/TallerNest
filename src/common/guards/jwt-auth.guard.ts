import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { obtenerRequest } from '../utils/request.util';

/**
 * Guard global: toda ruta requiere un access token válido salvo las marcadas
 * con @Public(). Protege también el endpoint GraphQL (/graphql).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  /** Passport lee el header Authorization de aquí (REST o GraphQL). */
  getRequest(context: ExecutionContext) {
    return obtenerRequest(context);
  }
}
