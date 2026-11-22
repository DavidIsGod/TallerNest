import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { formatearErrorGraphql } from './formatear-error-graphql';

/** Así le llega a formatError un error lanzado dentro de un resolver. */
const desdeResolver = (original: Error) =>
  new GraphQLError(original.message, {
    path: ['medicamento'],
    originalError: original,
  });

const formateado = { message: 'x', path: ['medicamento'] };

describe('formatearErrorGraphql', () => {
  it.each([
    [new UnauthorizedException(), 'UNAUTHENTICATED'],
    [new ForbiddenException('Sin permiso'), 'FORBIDDEN'],
    [new NotFoundException('Medicamento no encontrado'), 'NOT_FOUND'],
    [new HttpException('Demasiadas', 429), 'TOO_MANY_REQUESTS'],
    [new HttpException('Raro', 418), 'INTERNAL_SERVER_ERROR'],
  ])('pone el código según el status HTTP (%s)', (excepcion, code) => {
    const error = formatearErrorGraphql(formateado, desdeResolver(excepcion));
    expect(error.extensions).toEqual({ code });
    expect(error.path).toEqual(['medicamento']);
  });

  it('une los mensajes de validación en un solo texto', () => {
    const error = formatearErrorGraphql(
      formateado,
      desdeResolver(new BadRequestException(['Falta el nombre', 'Hora mal'])),
    );
    expect(error).toMatchObject({
      message: 'Falta el nombre. Hora mal',
      extensions: { code: 'BAD_REQUEST' },
    });
  });

  it('usa el mensaje de la excepción si la respuesta es un texto', () => {
    const error = formatearErrorGraphql(
      formateado,
      desdeResolver(new HttpException('Conflicto', 409)),
    );
    expect(error).toMatchObject({
      message: 'Conflicto',
      extensions: { code: 'CONFLICT' },
    });
  });

  it('oculta el detalle de los errores inesperados', () => {
    const error = formatearErrorGraphql(
      {
        message: 'connect ECONNREFUSED',
        extensions: { code: 'INTERNAL_SERVER_ERROR' },
      },
      desdeResolver(new Error('connect ECONNREFUSED')),
    );
    expect(error.message).toBe('Error interno del servidor');
  });

  it('deja igual los errores propios de GraphQL (consulta mal escrita)', () => {
    const deGraphql = {
      message: 'Cannot query field "x"',
      extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
    };
    expect(
      formatearErrorGraphql(deGraphql, new GraphQLError('Cannot query field')),
    ).toBe(deGraphql);
  });
});
