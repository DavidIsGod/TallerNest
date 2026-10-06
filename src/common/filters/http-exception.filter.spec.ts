import {
  ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();
  let json: jest.Mock;
  let host: ArgumentsHost;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/test' }),
      }),
    } as unknown as ArgumentsHost;
  });

  const body = () => json.mock.calls[0][0] as Record<string, unknown>;

  it('formatea HttpException con mensajes de validación', () => {
    filter.catch(new BadRequestException(['campo requerido']), host);
    expect(body()).toMatchObject({
      status: 400,
      error: 'Bad Request',
      message: ['campo requerido'],
      path: '/api/test',
    });
    expect(body().timestamp).toEqual(expect.any(String));
  });

  it('formatea HttpException con mensaje simple', () => {
    filter.catch(new NotFoundException('No existe'), host);
    expect(body()).toMatchObject({ status: 404, message: 'No existe' });
  });

  it('usa el mensaje de la excepción si la respuesta es un string', () => {
    const ex = new BadRequestException();
    jest.spyOn(ex, 'getResponse').mockReturnValue('texto');
    filter.catch(ex, host);
    expect(body()).toMatchObject({ status: 400, message: 'Bad Request' });
  });

  it('traduce violaciones de unicidad de PostgreSQL a 409', () => {
    const error = new QueryFailedError('INSERT', [], {
      code: '23505',
    } as unknown as Error);
    filter.catch(error, host);
    expect(body()).toMatchObject({ status: 409, error: 'Conflict' });
  });

  it('traduce violaciones de llave foránea a 400', () => {
    const error = new QueryFailedError('INSERT', [], {
      code: '23503',
    } as unknown as Error);
    filter.catch(error, host);
    expect(body()).toMatchObject({ status: 400 });
  });

  it('responde 500 ante errores desconocidos', () => {
    filter.catch(new Error('boom'), host);
    expect(body()).toMatchObject({
      status: 500,
      message: 'Error interno del servidor',
    });
    filter.catch('cadena', host);
    expect(json).toHaveBeenCalledTimes(2);
  });

  it('responde 500 ante QueryFailedError sin código conocido', () => {
    filter.catch(new QueryFailedError('SELECT', [], new Error('x')), host);
    expect(body()).toMatchObject({ status: 500 });
  });
});
