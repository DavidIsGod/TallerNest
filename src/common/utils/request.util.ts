import { ArgumentsHost, ExecutionContext } from '@nestjs/common';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';

/** true si la petición entró por POST /graphql (y no por un endpoint REST). */
export function esGraphql(host: ArgumentsHost): boolean {
  return host.getType<GqlContextType>() === 'graphql';
}

/**
 * Devuelve el request de Express sin importar si la petición es REST o GraphQL.
 *
 * - En REST el request sale de `switchToHttp()`.
 * - En GraphQL no hay "ruta": el request viaja dentro del contexto de GraphQL
 *   (lo pone ahí `context: ({ req }) => ({ req })` en app.module.ts).
 *
 * Así los mismos guards (JWT y roles) y el decorador @CurrentUser sirven para
 * los controladores REST y para los resolvers GraphQL.
 */
export function obtenerRequest<T>(context: ExecutionContext): T {
  if (esGraphql(context)) {
    return GqlExecutionContext.create(context).getContext<{ req: T }>().req;
  }
  return context.switchToHttp().getRequest<T>();
}
