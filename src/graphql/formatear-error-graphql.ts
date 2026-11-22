import { unwrapResolverError } from '@apollo/server/errors';
import { HttpException } from '@nestjs/common';
import { GraphQLFormattedError } from 'graphql';

/**
 * Código que viaja en errors[i].extensions.code según el status HTTP que
 * hubiera devuelto el mismo error en REST.
 */
const CODIGOS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_REQUESTS',
};

/**
 * GraphQL responde SIEMPRE con HTTP 200; si algo falla, el detalle va en el
 * arreglo `errors`. Esta función decide cómo se ve cada error:
 *
 *   { "message": "Medicamento no encontrado", "extensions": { "code": "NOT_FOUND" } }
 *
 * Así el frontend solo tiene que mirar `extensions.code` para saber qué pasó.
 */
export function formatearErrorGraphql(
  formateado: GraphQLFormattedError,
  error: unknown,
): GraphQLFormattedError {
  const original = unwrapResolverError(error);

  // Errores de Nest (NotFoundException, ForbiddenException, validación...).
  if (original instanceof HttpException) {
    const status = original.getStatus();
    const cuerpo = original.getResponse();
    const mensaje =
      typeof cuerpo === 'object' && 'message' in cuerpo
        ? (cuerpo as { message: string | string[] }).message
        : original.message;
    return {
      message: Array.isArray(mensaje) ? mensaje.join('. ') : mensaje,
      path: formateado.path,
      extensions: { code: CODIGOS[status] ?? 'INTERNAL_SERVER_ERROR' },
    };
  }

  // Errores inesperados (base de datos caída, bug...): no se filtran detalles.
  if (formateado.extensions?.code === 'INTERNAL_SERVER_ERROR') {
    return {
      message: 'Error interno del servidor',
      path: formateado.path,
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    };
  }

  // Errores propios de GraphQL (consulta mal escrita, variable de tipo
  // incorrecto...): se dejan tal cual los arma Apollo.
  return formateado;
}
