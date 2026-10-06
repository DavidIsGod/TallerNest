import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '../common/enums/role.enum';
import { UsersService } from './users.service';

/**
 * Garantiza que siempre exista al menos un administrador (usuario: admin)
 * con las credenciales de ADMIN_EMAIL / ADMIN_PASSWORD.
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if ((await this.users.countByRole(Role.ADMIN)) > 0) return;
    const email = this.config.get<string>('ADMIN_EMAIL', 'admin@mediplan.com');
    if (await this.users.findByEmail(email)) return;
    await this.users.create({
      nombre: this.config.get<string>('ADMIN_NAME', 'Administrador MediPlan'),
      email,
      password: this.config.get<string>('ADMIN_PASSWORD', 'Admin123*'),
      rol: Role.ADMIN,
    });
    this.logger.log(`Administrador inicial creado: ${email}`);
  }
}
