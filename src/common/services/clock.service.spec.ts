import { createConfigMock } from '../testing/mocks';
import { ClockService } from './clock.service';

describe('ClockService', () => {
  it('usa la zona horaria configurada', () => {
    const clock = new ClockService(createConfigMock({ APP_TIMEZONE: 'UTC' }));
    expect(clock.timeZone).toBe('UTC');
    expect(clock.local(new Date('2026-10-05T23:00:00Z'))).toEqual({
      fecha: '2026-10-05',
      hora: '23:00:00',
    });
  });

  it('usa America/Bogota por defecto y expone now/today', () => {
    const clock = new ClockService(createConfigMock());
    expect(clock.timeZone).toBe('America/Bogota');
    expect(clock.now()).toBeInstanceOf(Date);
    expect(clock.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(clock.local().hora).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
