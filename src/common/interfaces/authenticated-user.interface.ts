import { Role } from '../enums/role.enum';

/** Usuario autenticado que la estrategia JWT adjunta a `request.user`. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  nombre: string;
  rol: Role;
  sessionId: string;
}
