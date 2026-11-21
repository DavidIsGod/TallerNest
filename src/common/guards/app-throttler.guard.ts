import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';
import { esGraphql } from '../utils/request.util';

interface ThrottledRequest {
  ip?: string;
  ips?: string[];
  body?: { email?: unknown };
}

/**
 * Rate limiting global. Cuando la petición incluye un email (login,
 * registro) el límite se aplica por IP + email: frena la fuerza bruta sobre
 * una cuenta sin bloquear a otros usuarios que comparten la misma IP.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: ThrottledRequest): Promise<string> {
    const ip = req.ips?.length ? req.ips[0] : (req.ip ?? 'unknown');
    const email = req.body?.email;
    return Promise.resolve(
      typeof email === 'string' && email
        ? `${ip}:${email.trim().toLowerCase()}`
        : ip,
    );
  }

  /** En GraphQL el request y el response vienen en el contexto de GraphQL. */
  protected getRequestResponse(context: ExecutionContext) {
    if (esGraphql(context)) {
      const { req, res } = GqlExecutionContext.create(context).getContext<{
        req: Record<string, unknown>;
        res: Record<string, unknown>;
      }>();
      return { req, res };
    }
    return super.getRequestResponse(context);
  }
}
