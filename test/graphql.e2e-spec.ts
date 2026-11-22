import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ADMIN_CREDENTIALS, bearer, createTestApp, login } from './utils';

interface RespuestaGraphql {
  data: Record<string, unknown> | null;
  errors?: { message: string; extensions: { code: string } }[];
}

const LISTAR = `
  query Listar($filtros: FiltrosMedicamentosInput!) {
    medicamentos(filtros: $filtros) { totalItems items { id nombre activo } }
  }
`;
const CREAR = `
  mutation Crear($datos: MedicamentoInput!) {
    crearMedicamento(datos: $datos) { id nombre horarios advertencias }
  }
`;
const DETALLE = `
  query Detalle($id: ID!) { medicamento(id: $id) { id nombre } }
`;
const datos = {
  nombre: 'Glucophage GQL',
  principioActivo: 'metformina',
  dosis: '850 mg',
  frecuencia: 'Cada 12 horas',
  horarios: ['20:00', '08:00'],
  fechaInicio: '2026-11-01',
};

describe('GraphQL: medicamentos (e2e)', () => {
  let app: INestApplication<App>;
  let cuidador: string;
  let familiar: string;

  /** Envía una operación a POST /graphql (con o sin token). */
  const gql = async (
    query: string,
    variables: Record<string, unknown>,
    token?: string,
  ) => {
    const req = request(app.getHttpServer()).post('/graphql');
    if (token) void req.set(bearer(token));
    const res = await req.send({ query, variables }).expect(200);
    return res.body as RespuestaGraphql;
  };

  beforeAll(async () => {
    app = await createTestApp();
    const admin = (
      await login(app, ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password)
    ).accessToken;
    await request(app.getHttpServer())
      .post('/api/seed')
      .set(bearer(admin))
      .expect(200);
    cuidador = (await login(app, 'cuidador@mediplan.com', 'Cuidador123*'))
      .accessToken;
    familiar = (await login(app, 'familiar@mediplan.com', 'Familiar123*'))
      .accessToken;
  });

  afterAll(() => app.close());

  it('sin token falla en el servidor con UNAUTHENTICATED (y HTTP 200)', async () => {
    const body = await gql(LISTAR, { filtros: { pagina: 1, tamano: 5 } });
    expect(body.data).toBeNull();
    expect(body.errors?.[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('el familiar puede listar, pero no crear (FORBIDDEN)', async () => {
    const lista = await gql(
      LISTAR,
      { filtros: { pagina: 1, tamano: 5, activo: true } },
      familiar,
    );
    expect(lista.errors).toBeUndefined();
    expect(lista.data?.medicamentos).toMatchObject({ totalItems: 4 });

    const crear = await gql(CREAR, { datos }, familiar);
    expect(crear.errors?.[0].extensions.code).toBe('FORBIDDEN');
  });

  it('el cuidador crea con una mutación y lee el detalle', async () => {
    const crear = await gql(CREAR, { datos }, cuidador);
    const creado = crear.data?.crearMedicamento as { id: string };
    expect(creado).toMatchObject({
      nombre: 'Glucophage GQL',
      horarios: ['08:00', '20:00'],
      advertencias: [],
    });

    const detalle = await gql(DETALLE, { id: creado.id }, familiar);
    expect(detalle.data?.medicamento).toEqual({
      id: creado.id,
      nombre: 'Glucophage GQL',
    });
  });

  it('traduce los errores del servicio a códigos GraphQL', async () => {
    const noExiste = await gql(
      DETALLE,
      { id: '00000000-0000-4000-8000-000000000000' },
      cuidador,
    );
    expect(noExiste.errors?.[0]).toMatchObject({
      message: 'Medicamento no encontrado',
      extensions: { code: 'NOT_FOUND' },
    });

    const invalido = await gql(
      CREAR,
      { datos: { ...datos, horarios: ['08:00', '08:00'] } },
      cuidador,
    );
    expect(invalido.errors?.[0]).toMatchObject({
      message: 'Los horarios no pueden repetirse',
      extensions: { code: 'BAD_REQUEST' },
    });
  });
});
