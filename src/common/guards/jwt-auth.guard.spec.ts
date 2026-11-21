import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;

  it('permite el acceso a rutas @Public() sin validar el token', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    const guard = new JwtAuthGuard(reflector as unknown as Reflector);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('lee el request de REST o del contexto de GraphQL', () => {
    const guard = new JwtAuthGuard({} as Reflector);
    const req = { headers: {} };
    const rest = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    expect(guard.getRequest(rest)).toBe(req);
    const graphql = {
      getType: () => 'graphql',
      getArgs: () => [{}, {}, { req }, {}],
      getClass: jest.fn(),
      getHandler: jest.fn(),
    } as unknown as ExecutionContext;
    expect(guard.getRequest(graphql)).toBe(req);
  });

  it('delega en la estrategia JWT para rutas protegidas', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    const guard = new JwtAuthGuard(reflector as unknown as Reflector);
    const parent = jest
      .spyOn(AuthGuard('jwt').prototype, 'canActivate')
      .mockReturnValue(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(parent).toHaveBeenCalledWith(context);
    parent.mockRestore();
  });
});
