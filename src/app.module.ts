import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { envValidationSchema } from './config/env.validation';
import { buildTypeOrmOptions } from './config/typeorm.config';
import { ContactosModule } from './contactos/contactos.module';
import { formatearErrorGraphql } from './graphql/formatear-error-graphql';
import { HealthController } from './health/health.controller';
import { MedicamentosModule } from './medicamentos/medicamentos.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { OpenFdaModule } from './openfda/openfda.module';
import { ReportesModule } from './reportes/reportes.module';
import { SeedModule } from './seed/seed.module';
import { TomasModule } from './tomas/tomas.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? ['.env.test'] : ['.env'],
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...buildTypeOrmOptions(config),
        autoLoadEntities: true,
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL_MS', 60000),
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
        skipIf: () => config.get<string>('NODE_ENV') === 'test',
      }),
    }),
    ScheduleModule.forRoot(),
    // GraphQL (Code First): un único endpoint POST /graphql. El esquema se
    // genera en src/schema.gql a partir de las clases con @ObjectType/@InputType.
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      // IDE para probar consultas en el navegador: Apollo Sandbox en GET /graphql.
      playground: false,
      plugins: [ApolloServerPluginLandingPageLocalDefault()],
      introspection: true,
      // El request de Express viaja en el contexto: de ahí leen el token los
      // mismos guards globales de REST (JWT, roles y rate limiting).
      context: ({ req, res }: { req: unknown; res: unknown }) => ({ req, res }),
      formatError: formatearErrorGraphql,
    }),
    CommonModule,
    UsersModule,
    AuthModule,
    ContactosModule,
    OpenFdaModule,
    NotificacionesModule,
    TomasModule,
    MedicamentosModule,
    ReportesModule,
    SeedModule,
  ],
  controllers: [HealthController],
  providers: [
    // Orden de ejecución: rate limiting → autenticación → autorización.
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
