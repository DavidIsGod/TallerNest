import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Role } from '../enums/role.enum';
import { ADMIN, CAREGIVER, FAMILY } from '../testing/mocks';
import { RolesGuard } from './roles.guard';

function contextFor(user?: unknown): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new RolesGuard(reflector as unknown as Reflector);

  it('permite el acceso si la ruta no exige roles', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(contextFor(FAMILY))).toBe(true);
    reflector.getAllAndOverride.mockReturnValue([]);
    expect(guard.canActivate(contextFor(FAMILY))).toBe(true);
  });

  it('permite el acceso si el usuario tiene uno de los roles', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.CAREGIVER, Role.ADMIN]);
    expect(guard.canActivate(contextFor(CAREGIVER))).toBe(true);
    expect(guard.canActivate(contextFor(ADMIN))).toBe(true);
  });

  it('en GraphQL lee el usuario del request que viaja en el contexto', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.CAREGIVER]);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      getType: () => 'graphql',
    } as unknown as ExecutionContext;
    const spy = jest.spyOn(GqlExecutionContext, 'create');
    spy.mockReturnValue({
      getContext: () => ({ req: { user: FAMILY } }),
    } as unknown as GqlExecutionContext);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    spy.mockReturnValue({
      getContext: () => ({ req: { user: CAREGIVER } }),
    } as unknown as GqlExecutionContext);
    expect(guard.canActivate(context)).toBe(true);
    spy.mockRestore();
  });

  it('lanza 403 si el rol no está permitido o no hay usuario', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.CAREGIVER]);
    expect(() => guard.canActivate(contextFor(FAMILY))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
