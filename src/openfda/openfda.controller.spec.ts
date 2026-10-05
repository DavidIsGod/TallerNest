import { OpenFdaController } from './openfda.controller';
import { OpenFdaService } from './openfda.service';

describe('OpenFdaController', () => {
  it('consulta openFDA con el principio activo', async () => {
    const service = {
      consultar: jest.fn().mockResolvedValue({ encontrado: true }),
    };
    const controller = new OpenFdaController(
      service as unknown as OpenFdaService,
    );
    await expect(
      controller.consultar({ principioActivo: 'metformina' }),
    ).resolves.toEqual({ encontrado: true });
    expect(service.consultar).toHaveBeenCalledWith('metformina');
  });
});
