import { Logger } from '@nestjs/common';
import { createConfigMock } from '../common/testing/mocks';
import { CanalNotificacion, EstadoNotificacion } from './enums';
import { TwilioService } from './twilio.service';

const credenciales = {
  TWILIO_ACCOUNT_SID: 'AC123',
  TWILIO_AUTH_TOKEN: 'token',
  TWILIO_FROM_NUMBER: '+15005550006',
};

describe('TwilioService', () => {
  let fetchMock: jest.SpyInstance;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('funciona en modo simulado sin credenciales', async () => {
    const service = new TwilioService(createConfigMock());
    expect(service.configurado).toBe(false);
    const result = await service.enviar('+573001234567', 'hola');
    expect(result).toMatchObject({
      estado: EstadoNotificacion.SIMULADA,
      canal: CanalNotificacion.SMS,
      destino: '+573001234567',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envía por la API de Twilio con autenticación básica', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ sid: 'SM1', status: 'queued' }),
    });
    const service = new TwilioService(createConfigMock(credenciales));
    const result = await service.enviar('+573001234567', 'hola');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json',
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('AC123:token').toString('base64')}`,
    );
    expect(String(init.body)).toContain('To=%2B573001234567');
    expect(result).toMatchObject({
      estado: EstadoNotificacion.ENVIADA,
      sid: 'SM1',
      estadoProveedor: 'queued',
    });
  });

  it('usa el prefijo whatsapp: en el canal WhatsApp', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({}),
    });
    const service = new TwilioService(
      createConfigMock({ ...credenciales, TWILIO_CHANNEL: 'whatsapp' }),
    );
    const result = await service.enviar('+573001234567', 'hola');
    expect(result).toMatchObject({
      canal: CanalNotificacion.WHATSAPP,
      destino: 'whatsapp:+573001234567',
      sid: null,
      estadoProveedor: 'queued',
    });
    const body = String((fetchMock.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain('From=whatsapp%3A%2B15005550006');
  });

  it('registra el error si Twilio rechaza el mensaje', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'Invalid To', status: 'failed' }),
    });
    const service = new TwilioService(createConfigMock(credenciales));
    await expect(service.enviar('+57', 'x')).resolves.toMatchObject({
      estado: EstadoNotificacion.FALLIDA,
      error: 'Invalid To',
      estadoProveedor: 'failed',
    });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });
    await expect(service.enviar('+57', 'x')).resolves.toMatchObject({
      error: 'HTTP 500',
      estadoProveedor: 'failed',
    });
  });

  it('nunca lanza ante errores de red', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    const service = new TwilioService(createConfigMock(credenciales));
    await expect(service.enviar('+57', 'x')).resolves.toMatchObject({
      estado: EstadoNotificacion.FALLIDA,
      error: 'timeout',
    });
  });
});
