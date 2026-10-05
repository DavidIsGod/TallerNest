import { Logger } from '@nestjs/common';
import { createConfigMock } from '../common/testing/mocks';
import { InfoOpenFda } from './interfaces/info-openfda.interface';
import { OpenFdaService } from './openfda.service';
import { candidatosDeBusqueda, normalizarTexto } from './principios-activos';

const jsonResponse = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as Response;

describe('OpenFdaService', () => {
  let fetchMock: jest.SpyInstance;
  const enabled = new OpenFdaService(
    createConfigMock({ OPENFDA_ENABLED: true, OPENFDA_API_KEY: 'key' }),
  );

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('no consulta la API si está deshabilitada', async () => {
    const service = new OpenFdaService(
      createConfigMock({ OPENFDA_ENABLED: false }),
    );
    const info = await service.consultar('metformina');
    expect(info).toMatchObject({ encontrado: false, fuente: 'deshabilitado' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('traduce el principio activo y extrae los campos relevantes', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        results: [
          {
            boxed_warning: ['Lactic acidosis'],
            warnings: ['x'.repeat(2000)],
            drug_interactions: [
              'Carbonic anhydrase inhibitors such as topiramate',
            ],
            adverse_reactions: ['Diarrhea'],
            indications_and_usage: ['Type 2 diabetes'],
            dosage_and_administration: ['500 mg twice daily'],
            openfda: { generic_name: ['METFORMIN HYDROCHLORIDE'] },
          },
        ],
      }),
    );
    const info = await enabled.consultar('Metformina');
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('openfda.generic_name%3A%22metformin%22');
    expect(url).toContain('api_key=key');
    expect(info).toMatchObject({
      encontrado: true,
      terminoBusqueda: 'metformin',
      nombreGenerico: 'METFORMIN HYDROCHLORIDE',
      reaccionesAdversas: ['Diarrhea'],
      fuente: 'openFDA',
    });
    expect(info.advertencias[0]).toBe('Lactic acidosis');
    expect(info.advertencias[1].length).toBe(1501);
  });

  it('prueba varios candidatos y avisa si no encuentra información', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, {}));
    const info = await enabled.consultar('medicamentoinventado');
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(info.encontrado).toBe(false);
    expect(info.mensaje).toContain('No se encontró');
  });

  it('trata una respuesta sin resultados como no encontrada', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    const info = await enabled.consultar('enalapril');
    expect(info.encontrado).toBe(false);
  });

  it('no falla si openFDA responde con error o no hay red', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
    await expect(enabled.consultar('losartan')).resolves.toMatchObject({
      encontrado: false,
      mensaje: 'No fue posible consultar openFDA en este momento',
    });
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(enabled.consultar('losartan')).resolves.toMatchObject({
      encontrado: false,
    });
  });

  it('usa valores por defecto de URL y timeout', async () => {
    const service = new OpenFdaService(
      createConfigMock({ OPENFDA_ENABLED: true }),
    );
    fetchMock.mockResolvedValue(jsonResponse(404, {}));
    await service.consultar('omeprazol');
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /^https:\/\/api\.fda\.gov\/drug\/label\.json\?/,
    );
  });

  describe('detectarInteracciones', () => {
    const info = (interacciones: string[], encontrado = true): InfoOpenFda => ({
      encontrado,
      interacciones,
      advertencias: [],
      reaccionesAdversas: [],
      indicaciones: [],
      dosificacion: [],
      fuente: 'openFDA',
      consultadoEn: '',
    });

    it('detecta medicamentos activos mencionados en las interacciones', () => {
      const alertas = enabled.detectarInteracciones(
        info(['Concomitant use with Warfarin may increase bleeding risk.']),
        [
          { id: 'm1', nombre: 'Coumadin', principioActivo: 'warfarina' },
          { id: 'm2', nombre: 'Omeprazol', principioActivo: 'omeprazol' },
        ],
      );
      expect(alertas).toHaveLength(1);
      expect(alertas[0]).toMatchObject({
        medicamentoId: 'm1',
        nombre: 'Coumadin',
      });
      expect(alertas[0].detalle).toContain('warfarin');
    });

    it('no genera alertas sin información o sin interacciones', () => {
      expect(enabled.detectarInteracciones(null, [])).toEqual([]);
      expect(enabled.detectarInteracciones(info([], true), [])).toEqual([]);
      expect(enabled.detectarInteracciones(info(['x'], false), [])).toEqual([]);
    });
  });
});

describe('principios-activos', () => {
  it('normaliza acentos, mayúsculas y espacios', () => {
    expect(normalizarTexto('  Ácido   Acetilsalicílico ')).toBe(
      'acido acetilsalicilico',
    );
  });

  it('genera candidatos de búsqueda en inglés', () => {
    expect(candidatosDeBusqueda('Losartán')).toEqual(['losartan']);
    expect(candidatosDeBusqueda('atorvastatina')).toEqual([
      'atorvastatin',
      'atorvastatina',
      'atorvastatine',
    ]);
    expect(candidatosDeBusqueda('sitagliptina')).toEqual([
      'sitagliptina',
      'sitagliptin',
      'sitagliptine',
    ]);
  });
});
