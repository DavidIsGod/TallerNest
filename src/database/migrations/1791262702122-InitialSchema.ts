import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1791262702122 implements MigrationInterface {
  name = 'InitialSchema1791262702122';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TYPE "public"."usuario_rol_enum" AS ENUM('ROLE_ADMIN', 'ROLE_CAREGIVER', 'ROLE_FAMILY')`,
    );
    await queryRunner.query(
      `CREATE TABLE "usuarios" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying(150) NOT NULL, "email" character varying(200) NOT NULL, "password_hash" character varying(255) NOT NULL, "rol" "public"."usuario_rol_enum" NOT NULL, "telefono" character varying(20), "activo" boolean NOT NULL DEFAULT true, "ultimo_login" TIMESTAMP WITH TIME ZONE, "two_factor_enabled" boolean NOT NULL DEFAULT false, "two_factor_secret" character varying(64), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_446adfc18b35418aac32ae0b7b5" UNIQUE ("email"), CONSTRAINT "PK_d7281c63c176e152e4c531594a8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "medicamentos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying(200) NOT NULL, "principio_activo" character varying(200) NOT NULL, "dosis" character varying(100) NOT NULL, "frecuencia" character varying(50) NOT NULL, "horarios" jsonb NOT NULL, "fecha_inicio" date NOT NULL, "fecha_fin" date, "instrucciones" text, "activo" boolean NOT NULL DEFAULT true, "info_openfda" jsonb, "paciente_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3985b0c130d1322e867f7ad5ee9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_medicamento_paciente" ON "medicamentos" ("paciente_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."registro_toma_estado_enum" AS ENUM('PENDIENTE', 'TOMADO', 'OMITIDO')`,
    );
    await queryRunner.query(
      `CREATE TABLE "registros_toma" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "medicamento_id" uuid NOT NULL, "paciente_id" uuid NOT NULL, "fecha" date NOT NULL, "hora_programada" TIME NOT NULL, "hora_real" TIMESTAMP WITH TIME ZONE, "estado" "public"."registro_toma_estado_enum" NOT NULL DEFAULT 'PENDIENTE', "notas" text, "notificacion_enviada" boolean NOT NULL DEFAULT false, "omision_automatica" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_toma_medicamento_fecha_hora" UNIQUE ("medicamento_id", "fecha", "hora_programada"), CONSTRAINT "PK_5b102c8ff275f2d688f5c1fdbd5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_toma_medicamento" ON "registros_toma" ("medicamento_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_toma_estado" ON "registros_toma" ("estado") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_toma_paciente_fecha" ON "registros_toma" ("paciente_id", "fecha") `,
    );
    await queryRunner.query(
      `CREATE TABLE "contactos_familiares" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "paciente_id" uuid NOT NULL, "usuario_id" uuid, "nombre" character varying(150) NOT NULL, "relacion" character varying(50) NOT NULL, "telefono" character varying(20) NOT NULL, "email" character varying(200), "es_emergencia" boolean NOT NULL DEFAULT false, "recibe_notificaciones" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_contacto_paciente_usuario" UNIQUE ("paciente_id", "usuario_id"), CONSTRAINT "PK_a76a36d529edd0c45f280f19f2c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_contacto_paciente" ON "contactos_familiares" ("paciente_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_contacto_usuario" ON "contactos_familiares" ("usuario_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notificacion_tipo_enum" AS ENUM('DOSIS_OMITIDA', 'RESUMEN_DIARIO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notificacion_canal_enum" AS ENUM('SMS', 'WHATSAPP')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notificacion_estado_enum" AS ENUM('ENVIADA', 'FALLIDA', 'SIMULADA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notificaciones" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "paciente_id" uuid NOT NULL, "contacto_id" uuid, "registro_toma_id" uuid, "tipo" "public"."notificacion_tipo_enum" NOT NULL, "canal" "public"."notificacion_canal_enum" NOT NULL, "destino" character varying(40) NOT NULL, "mensaje" text NOT NULL, "estado" "public"."notificacion_estado_enum" NOT NULL, "estado_proveedor" character varying(30), "proveedor_sid" character varying(64), "error" text, "intentos" integer NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a9d32a419ff58b53a38b5ef85d4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notificacion_paciente" ON "notificaciones" ("paciente_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notificacion_estado" ON "notificaciones" ("estado") `,
    );
    await queryRunner.query(
      `CREATE TABLE "sesiones" ("id" uuid NOT NULL, "usuario_id" uuid NOT NULL, "refresh_token_hash" character varying(128) NOT NULL, "expira_en" TIMESTAMP WITH TIME ZONE NOT NULL, "revocada_en" TIMESTAMP WITH TIME ZONE, "user_agent" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e4237ef09f1dc217c1660f23253" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sesion_usuario" ON "sesiones" ("usuario_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "medicamentos" ADD CONSTRAINT "FK_ea960c4874b5162f4305e0f8bf2" FOREIGN KEY ("paciente_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "registros_toma" ADD CONSTRAINT "FK_d9dd7aa19a4777a7464f43a983b" FOREIGN KEY ("medicamento_id") REFERENCES "medicamentos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "registros_toma" ADD CONSTRAINT "FK_79c9e6a9ca0e05c70d67876a555" FOREIGN KEY ("paciente_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "contactos_familiares" ADD CONSTRAINT "FK_eba834e9eb0c5a9c0862e8863b6" FOREIGN KEY ("paciente_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "contactos_familiares" ADD CONSTRAINT "FK_5c076e8e1e1b2433140ff059bd9" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notificaciones" ADD CONSTRAINT "FK_bc73f5e4c71dd81bdcf37ddeb64" FOREIGN KEY ("paciente_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notificaciones" ADD CONSTRAINT "FK_fbfe051aa7ff9885e920138b59d" FOREIGN KEY ("contacto_id") REFERENCES "contactos_familiares"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notificaciones" ADD CONSTRAINT "FK_88e1d36684093dbb74bc7fce94d" FOREIGN KEY ("registro_toma_id") REFERENCES "registros_toma"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sesiones" ADD CONSTRAINT "FK_be14eb22d2e8fbf2ca6c3fe0d56" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sesiones" DROP CONSTRAINT "FK_be14eb22d2e8fbf2ca6c3fe0d56"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notificaciones" DROP CONSTRAINT "FK_88e1d36684093dbb74bc7fce94d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notificaciones" DROP CONSTRAINT "FK_fbfe051aa7ff9885e920138b59d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notificaciones" DROP CONSTRAINT "FK_bc73f5e4c71dd81bdcf37ddeb64"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contactos_familiares" DROP CONSTRAINT "FK_5c076e8e1e1b2433140ff059bd9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contactos_familiares" DROP CONSTRAINT "FK_eba834e9eb0c5a9c0862e8863b6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "registros_toma" DROP CONSTRAINT "FK_79c9e6a9ca0e05c70d67876a555"`,
    );
    await queryRunner.query(
      `ALTER TABLE "registros_toma" DROP CONSTRAINT "FK_d9dd7aa19a4777a7464f43a983b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "medicamentos" DROP CONSTRAINT "FK_ea960c4874b5162f4305e0f8bf2"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_sesion_usuario"`);
    await queryRunner.query(`DROP TABLE "sesiones"`);
    await queryRunner.query(`DROP INDEX "public"."idx_notificacion_estado"`);
    await queryRunner.query(`DROP INDEX "public"."idx_notificacion_paciente"`);
    await queryRunner.query(`DROP TABLE "notificaciones"`);
    await queryRunner.query(`DROP TYPE "public"."notificacion_estado_enum"`);
    await queryRunner.query(`DROP TYPE "public"."notificacion_canal_enum"`);
    await queryRunner.query(`DROP TYPE "public"."notificacion_tipo_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_contacto_usuario"`);
    await queryRunner.query(`DROP INDEX "public"."idx_contacto_paciente"`);
    await queryRunner.query(`DROP TABLE "contactos_familiares"`);
    await queryRunner.query(`DROP INDEX "public"."idx_toma_paciente_fecha"`);
    await queryRunner.query(`DROP INDEX "public"."idx_toma_estado"`);
    await queryRunner.query(`DROP INDEX "public"."idx_toma_medicamento"`);
    await queryRunner.query(`DROP TABLE "registros_toma"`);
    await queryRunner.query(`DROP TYPE "public"."registro_toma_estado_enum"`);
    await queryRunner.query(`DROP INDEX "public"."idx_medicamento_paciente"`);
    await queryRunner.query(`DROP TABLE "medicamentos"`);
    await queryRunner.query(`DROP TABLE "usuarios"`);
    await queryRunner.query(`DROP TYPE "public"."usuario_rol_enum"`);
  }
}
