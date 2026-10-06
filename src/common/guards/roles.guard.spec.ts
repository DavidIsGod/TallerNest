import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { ADMIN, CAREGIVER, FAMILY } from '../testing/mocks';
import { RolesGuard } from './roles.guard';

function contextFor(user?: unknown): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
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
