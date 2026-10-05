import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  ADMIN_CREDENTIALS,
  bearer,
  createTestApp,
  localDate,
  login,
} from './utils';

interface Toma {
  id: string;
  estado: string;
  fecha: string;
  horaProgramada: string;
  medicamentoId: string;
  omisionAutomatica: boolean;
  notificacionEnviada: boolean;
}

describe('MediPlan: medicamentos, tomas, contactos y reportes (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let admin: string;
  let cuidador: string; // María (paciente/cuidadora)
  let cuidadorId: string;
  let familiar: string; // Andrés, vinculado a María
  let familiar2: string; // Lucía, vinculada a Jorge
  let medicamentoId: string;
  const HOY = localDate();

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    admin = (
      await login(app, ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password)
    ).accessToken;
  });

  afterAll(() => app.close());

  describe('seed', () => {
    it('solo el admin puede ejecutar el seed', async () => {
      await http.post('/api/seed').expect(401);
      const res = await http.post('/api/seed').set(bearer(admin)).expect(200);
      expect(res.body.data).toMatchObject({
        usuarios: 5,
        medicamentos: 6,
        contactos: 3,
      });
      expect(res.body.data.tomas).toBeGreaterThan(150);

      admin = (
        await login(app, ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password)
      ).accessToken;
      const maria = await login(app, 'cuidador@mediplan.com', 'Cuidador123*');
      cuidador = maria.accessToken;
      cuidadorId = maria.usuario.id;
      familiar = (await login(app, 'familiar@mediplan.com', 'Familiar123*'))
        .accessToken;
      familiar2 = (await login(app, 'familiar2@mediplan.com', 'Familiar123*'))
        .accessToken;

      await http.post('/api/seed').set(bearer(cuidador)).expect(403);
    });

    it('el usuario de demostración con 2FA exige el segundo factor', async () => {
      const res = await http
        .post('/api/auth/login')
        .send({ email: 'cuidador2fa@mediplan.com', password: 'Cuidador123*' })
        .expect(200);
      expect(res.body.data.requiresTwoFactor).toBe(true);
    });
  });

  describe('medicamentos', () => {
    it('el cuidador y su familiar ven los mismos medicamentos', async () => {
      const propios = await http
        .get('/api/medicamentos')
        .set(bearer(cuidador))
        .expect(200);
      const delFamiliar = await http
        .get('/api/medicamentos')
        .set(bearer(familiar))
        .expect(200);
      expect(propios.body.data.meta.totalItems).toBe(4);
      expect(delFamiliar.body.data.items).toEqual(propios.body.data.items);

      const otros = await http
        .get('/api/medicamentos')
        .set(bearer(familiar2))
        .expect(200);
      expect(otros.body.data.meta.totalItems).toBe(2);
    });

    it('filtra por nombre/principio activo y pagina', async () => {
      const res = await http
        .get('/api/medicamentos?nombre=metfor&activo=true&page=1&size=1')
        .set(bearer(cuidador))
        .expect(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].principioActivo).toBe('metformina');
    });

    it('el familiar no puede crear medicamentos (403)', async () => {
      await http
        .post('/api/medicamentos')
        .set(bearer(familiar))
        .send({})
        .expect(403);
    });

    it('valida horarios, fechas y campos obligatorios (400)', async () => {
      const res = await http
        .post('/api/medicamentos')
        .set(bearer(cuidador))
        .send({
          nombre: 'X',
          principioActivo: 'x',
          dosis: '1',
          frecuencia: 'diaria',
          horarios: ['25:00', '08:00', '08:00'],
          fechaInicio: '2026-02-30',
        })
        .expect(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'Cada horario debe tener formato HH:mm (24 horas)',
          'Los horarios no pueden repetirse',
        ]),
      );

      await http
        .post('/api/medicamentos')
        .set(bearer(cuidador))
        .send({
          nombre: 'X',
          principioActivo: 'x',
          dosis: '1',
          frecuencia: 'diaria',
          horarios: ['08:00'],
          fechaInicio: '2026-10-10',
          fechaFin: '2026-10-01',
        })
        .expect(400);
    });

    it('crea un medicamento con info de openFDA y alertas', async () => {
      const res = await http
        .post('/api/medicamentos')
        .set(bearer(cuidador))
        .send({
          nombre: 'Coumadin',
          principioActivo: 'warfarina',
          dosis: '5 mg',
          frecuencia: '3 veces al día',
          horarios: ['20:00', '00:00', '12:00'],
          fechaInicio: localDate(-1),
          instrucciones: 'Evitar alimentos ricos en vitamina K',
        })
        .expect(201);
      const { medicamento, alertas, tomasGeneradasHoy } = res.body.data;
      expect(medicamento).toMatchObject({
        pacienteId: cuidadorId,
        horarios: ['00:00', '12:00', '20:00'],
        activo: true,
        fechaFin: null,
      });
      expect(medicamento.infoOpenfda).toMatchObject({ encontrado: false });
      expect(alertas.mensaje).toContain('openFDA');
      expect(tomasGeneradasHoy).toBeGreaterThanOrEqual(0);
      medicamentoId = medicamento.id;
    });

    it('detalle: acceso del cuidador y su familiar, 403 para otros', async () => {
      await http
        .get(`/api/medicamentos/${medicamentoId}`)
        .set(bearer(familiar))
        .expect(200);
      await http
        .get(`/api/medicamentos/${medicamentoId}`)
        .set(bearer(familiar2))
        .expect(403);
      await http
        .get('/api/medicamentos/00000000-0000-4000-8000-000000000000')
        .set(bearer(cuidador))
        .expect(404);
    });

    it('actualiza, desactiva/activa y elimina lógicamente', async () => {
      const upd = await http
        .put(`/api/medicamentos/${medicamentoId}`)
        .set(bearer(cuidador))
        .send({ dosis: '2.5 mg' })
        .expect(200);
      expect(upd.body.data.medicamento.dosis).toBe('2.5 mg');

      await http
        .put(`/api/medicamentos/${medicamentoId}`)
        .set(bearer(familiar))
        .send({ dosis: '1 mg' })
        .expect(403);

      const off = await http
        .patch(`/api/medicamentos/${medicamentoId}/toggle`)
        .set(bearer(cuidador))
        .expect(200);
      expect(off.body.data.activo).toBe(false);
      const on = await http
        .patch(`/api/medicamentos/${medicamentoId}/toggle`)
        .set(bearer(cuidador))
        .expect(200);
      expect(on.body.data.activo).toBe(true);
    });

    it('openFDA: consulta directa (deshabilitada en pruebas)', async () => {
      const res = await http
        .get('/api/openfda/consulta?principioActivo=metformina')
        .set(bearer(cuidador))
        .expect(200);
      expect(res.body.data).toMatchObject({
        encontrado: false,
        fuente: 'deshabilitado',
      });
    });
  });

  describe('registro de tomas', () => {
    let pendiente: Toma;

    it('el job de generación crea las tomas del día (idempotente)', async () => {
      await http
        .post('/api/tomas/jobs/generar')
        .set(bearer(cuidador))
        .expect(403);
      const res = await http
        .post('/api/tomas/jobs/generar')
        .set(bearer(admin))
        .send({ fecha: HOY })
        .expect(200);
      expect(res.body.data.creadas).toBeGreaterThanOrEqual(0);
      const again = await http
        .post('/api/tomas/jobs/generar')
        .set(bearer(admin))
        .send({ fecha: HOY })
        .expect(200);
      expect(again.body.data.creadas).toBe(0);

      const list = await http
        .get(`/api/tomas?medicamentoId=${medicamentoId}&fecha=${HOY}`)
        .set(bearer(cuidador))
        .expect(200);
      expect(list.body.data.items).toHaveLength(3);
      pendiente = (list.body.data.items as Toma[]).find(
        (t) => t.estado === 'PENDIENTE',
      )!;
      expect(pendiente).toBeDefined();
    });

    it('GET /api/tomas/hoy y /api/tomas/resumen', async () => {
      const hoy = await http
        .get('/api/tomas/hoy')
        .set(bearer(familiar))
        .expect(200);
      expect(hoy.body.data.length).toBeGreaterThanOrEqual(3);
      expect(hoy.body.data[0].medicamento).toHaveProperty('nombre');
      expect(hoy.body.data[0].medicamento.infoOpenfda).toBeUndefined();

      const resumen = await http
        .get('/api/tomas/resumen')
        .set(bearer(cuidador))
        .expect(200);
      expect(resumen.body.data).toMatchObject({ fecha: HOY });
      const { total, tomadas, omitidas, pendientes } = resumen.body.data;
      expect(tomadas + omitidas + pendientes).toBe(total);
    });

    it('el familiar no puede marcar tomas (403)', async () => {
      await http
        .patch(`/api/tomas/${pendiente.id}`)
        .set(bearer(familiar))
        .send({ estado: 'TOMADO' })
        .expect(403);
    });

    it('marca una toma como TOMADO y registra la hora real', async () => {
      const res = await http
        .patch(`/api/tomas/${pendiente.id}`)
        .set(bearer(cuidador))
        .send({ estado: 'TOMADO', notas: 'Con el almuerzo' })
        .expect(200);
      expect(res.body.data).toMatchObject({
        estado: 'TOMADO',
        notas: 'Con el almuerzo',
      });
      expect(res.body.data.horaReal).not.toBeNull();

      await http
        .patch(`/api/tomas/${pendiente.id}`)
        .set(bearer(cuidador))
        .send({ estado: 'OMITIDO' })
        .expect(409);
      await http
        .patch(`/api/tomas/${pendiente.id}`)
        .set(bearer(cuidador))
        .send({ estado: 'PENDIENTE' })
        .expect(400);
    });

    it('marcar OMITIDO notifica a los familiares', async () => {
      const list = await http
        .get(
          `/api/tomas?medicamentoId=${medicamentoId}&fecha=${HOY}&estado=PENDIENTE`,
        )
        .set(bearer(cuidador))
        .expect(200);
      const toma = (list.body.data.items as Toma[])[0];
      const res = await http
        .patch(`/api/tomas/${toma.id}`)
        .set(bearer(cuidador))
        .send({ estado: 'OMITIDO' })
        .expect(200);
      expect(res.body.data).toMatchObject({
        estado: 'OMITIDO',
        notificacionEnviada: true,
      });

      const notifs = await http
        .get('/api/notificaciones?tipo=DOSIS_OMITIDA&size=50')
        .set(bearer(familiar))
        .expect(200);
      const alerta = (
        notifs.body.data.items as {
          registroTomaId: string;
          mensaje: string;
          estado: string;
        }[]
      ).find((n) => n.registroTomaId === toma.id);
      expect(alerta).toMatchObject({ estado: 'SIMULADA' });
      expect(alerta!.mensaje).toContain('no ha tomado su dosis de Coumadin');
    });

    it('no permite registrar tomas de fechas futuras', async () => {
      const manana = localDate(1);
      await http
        .post('/api/tomas/jobs/generar')
        .set(bearer(admin))
        .send({ fecha: manana })
        .expect(200);
      const list = await http
        .get(`/api/tomas?medicamentoId=${medicamentoId}&fecha=${manana}`)
        .set(bearer(cuidador))
        .expect(200);
      await http
        .patch(`/api/tomas/${(list.body.data.items as Toma[])[0].id}`)
        .set(bearer(cuidador))
        .send({ estado: 'TOMADO' })
        .expect(400);
    });

    it('el job de omisiones marca OMITIDO las tomas vencidas (> 2 h)', async () => {
      const ayer = localDate(-1);
      await http
        .post('/api/tomas/jobs/generar')
        .set(bearer(admin))
        .send({ fecha: ayer })
        .expect(200);
      const res = await http
        .post('/api/tomas/jobs/detectar-omisiones')
        .set(bearer(admin))
        .expect(200);
      expect(res.body.data.omitidas).toBeGreaterThanOrEqual(3);

      const list = await http
        .get(`/api/tomas?medicamentoId=${medicamentoId}&fecha=${ayer}`)
        .set(bearer(cuidador))
        .expect(200);
      expect(
        (list.body.data.items as Toma[]).every(
          (t) => t.estado === 'OMITIDO' && t.omisionAutomatica,
        ),
      ).toBe(true);
    });

    it('resumen diario y reintentos de notificaciones (admin)', async () => {
      const res = await http
        .post('/api/tomas/jobs/resumen-diario')
        .set(bearer(admin))
        .send({})
        .expect(200);
      expect(res.body.data.pacientes).toBeGreaterThanOrEqual(2);
      await http
        .post('/api/notificaciones/reintentar')
        .set(bearer(admin))
        .expect(200);
    });

    it('filtros de rango y validaciones de consulta', async () => {
      await http
        .get(`/api/tomas?desde=${localDate(-7)}&hasta=${HOY}&size=5`)
        .set(bearer(cuidador))
        .expect(200);
      await http
        .get(`/api/tomas?desde=${HOY}&hasta=${localDate(-7)}`)
        .set(bearer(cuidador))
        .expect(400);
      await http
        .get('/api/tomas?estado=PERDIDO')
        .set(bearer(cuidador))
        .expect(400);
      await http
        .get(`/api/tomas/${pendiente.id}`)
        .set(bearer(familiar2))
        .expect(403);
      await http
        .get(`/api/tomas/${pendiente.id}`)
        .set(bearer(familiar))
        .expect(200);
    });

    it('DELETE de un medicamento es lógico y conserva el historial', async () => {
      await http
        .delete(`/api/medicamentos/${medicamentoId}`)
        .set(bearer(cuidador))
        .expect(204);
      const det = await http
        .get(`/api/medicamentos/${medicamentoId}`)
        .set(bearer(cuidador))
        .expect(200);
      expect(det.body.data.medicamento.activo).toBe(false);
      const tomas = await http
        .get(`/api/tomas?medicamentoId=${medicamentoId}`)
        .set(bearer(cuidador))
        .expect(200);
      expect(tomas.body.data.meta.totalItems).toBeGreaterThan(0);
    });
  });

  describe('contactos de emergencia y familiares', () => {
    let nuevoId: string;
    let emergenciaId: string;

    it('lista los contactos del paciente (cuidador y familiar)', async () => {
      const res = await http
        .get('/api/contactos')
        .set(bearer(cuidador))
        .expect(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].esEmergencia).toBe(true);
      emergenciaId = res.body.data[0].id;
      await http.get('/api/contactos').set(bearer(familiar)).expect(200);
      await http
        .get(`/api/contactos/${emergenciaId}`)
        .set(bearer(familiar2))
        .expect(403);
    });

    it('el familiar consulta los pacientes a los que tiene acceso', async () => {
      const res = await http
        .get('/api/contactos/mis-pacientes')
        .set(bearer(familiar))
        .expect(200);
      expect(res.body.data).toEqual([
        expect.objectContaining({
          pacienteId: cuidadorId,
          nombre: 'María Gómez',
        }),
      ]);
      await http
        .get('/api/contactos/mis-pacientes')
        .set(bearer(cuidador))
        .expect(403);
    });

    it('valida el teléfono E.164 y crea el contacto', async () => {
      await http
        .post('/api/contactos')
        .set(bearer(cuidador))
        .send({ nombre: 'Pedro', relacion: 'Vecino', telefono: '3001234567' })
        .expect(400);
      const res = await http
        .post('/api/contactos')
        .set(bearer(cuidador))
        .send({
          nombre: 'Pedro',
          relacion: 'Vecino',
          telefono: '+573001234567',
        })
        .expect(201);
      expect(res.body.data).toMatchObject({
        esEmergencia: false,
        recibeNotificaciones: true,
      });
      nuevoId = res.body.data.id;
    });

    it('vincula usuarios ROLE_FAMILY y evita duplicados', async () => {
      await http
        .post('/api/contactos')
        .set(bearer(cuidador))
        .send({
          nombre: 'Andrés',
          relacion: 'Hijo',
          telefono: '+573001234568',
          usuarioEmail: 'familiar@mediplan.com',
        })
        .expect(409);
      await http
        .put(`/api/contactos/${nuevoId}`)
        .set(bearer(cuidador))
        .send({ usuarioEmail: 'cuidador2fa@mediplan.com' })
        .expect(400);
    });

    it('actualiza datos y preferencias de notificación', async () => {
      const upd = await http
        .put(`/api/contactos/${nuevoId}`)
        .set(bearer(cuidador))
        .send({ relacion: 'Amigo', email: 'pedro@correo.com' })
        .expect(200);
      expect(upd.body.data).toMatchObject({
        relacion: 'Amigo',
        email: 'pedro@correo.com',
      });

      const notif = await http
        .patch(`/api/contactos/${nuevoId}/notificaciones`)
        .set(bearer(cuidador))
        .send({ recibeNotificaciones: false })
        .expect(200);
      expect(notif.body.data.recibeNotificaciones).toBe(false);
    });

    it('protege la regla de al menos un contacto de emergencia', async () => {
      await http
        .delete(`/api/contactos/${emergenciaId}`)
        .set(bearer(cuidador))
        .expect(409);
      await http
        .put(`/api/contactos/${emergenciaId}`)
        .set(bearer(cuidador))
        .send({ esEmergencia: false })
        .expect(409);
    });

    it('elimina un contacto (204) y el familiar no puede borrar (403)', async () => {
      await http
        .delete(`/api/contactos/${nuevoId}`)
        .set(bearer(familiar))
        .expect(403);
      await http
        .delete(`/api/contactos/${nuevoId}`)
        .set(bearer(cuidador))
        .expect(204);
      await http
        .get(`/api/contactos/${nuevoId}`)
        .set(bearer(cuidador))
        .expect(404);
    });
  });

  describe('reportes y estadísticas', () => {
    it('adherencia global con serie diaria del periodo', async () => {
      const res = await http
        .get('/api/reportes/adherencia?periodo=30d')
        .set(bearer(familiar))
        .expect(200);
      expect(res.body.data).toMatchObject({ periodo: '30d', hasta: HOY });
      expect(res.body.data.serie).toHaveLength(30);
      expect(res.body.data.adherencia).toBeGreaterThan(0);
      await http
        .get('/api/reportes/adherencia?periodo=1y')
        .set(bearer(cuidador))
        .expect(400);
    });

    it('adherencia por medicamento y patrones de omisión', async () => {
      const porMed = await http
        .get('/api/reportes/por-medicamento?periodo=90d')
        .set(bearer(cuidador))
        .expect(200);
      expect(porMed.body.data.medicamentos.length).toBeGreaterThanOrEqual(4);

      const patrones = await http
        .get('/api/reportes/patrones?periodo=30d')
        .set(bearer(cuidador))
        .expect(200);
      expect(patrones.body.data.heatmap).toHaveLength(7);
      expect(patrones.body.data.heatmap[0]).toHaveLength(24);
      expect(patrones.body.data.totalOmitidas).toBeGreaterThan(0);
    });

    it('historial paginado con filtros', async () => {
      const res = await http
        .get(
          `/api/reportes/historial?fechaInicio=${localDate(-10)}&fechaFin=${HOY}&estado=OMITIDO&page=1&size=5`,
        )
        .set(bearer(cuidador))
        .expect(200);
      expect(res.body.data.items.length).toBeLessThanOrEqual(5);
      expect(
        (res.body.data.items as Toma[]).every((t) => t.estado === 'OMITIDO'),
      ).toBe(true);
    });

    it('dashboard resumen', async () => {
      const res = await http
        .get('/api/reportes/resumen')
        .set(bearer(familiar))
        .expect(200);
      expect(res.body.data).toMatchObject({
        paciente: { id: cuidadorId, nombre: 'María Gómez' },
        fecha: HOY,
      });
      expect(Array.isArray(res.body.data.alertas)).toBe(true);
    });

    it('exporta el reporte en PDF', async () => {
      const res = await http
        .get('/api/reportes/exportar/pdf?periodo=7d')
        .set(bearer(cuidador))
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (c: Buffer) => chunks.push(c));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment;');
      expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    });

    it('el admin debe indicar pacienteId; un familiar no ve pacientes ajenos', async () => {
      await http.get('/api/reportes/resumen').set(bearer(admin)).expect(400);
      await http
        .get(`/api/reportes/resumen?pacienteId=${cuidadorId}`)
        .set(bearer(admin))
        .expect(200);
      await http
        .get(`/api/reportes/adherencia?pacienteId=${cuidadorId}`)
        .set(bearer(familiar2))
        .expect(403);
    });
  });
});
