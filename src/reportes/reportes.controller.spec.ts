import { StreamableFile } from '@nestjs/common';
import { FAMILY } from '../common/testing/mocks';
import { Periodo } from './dto/reporte-query.dto';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

describe('ReportesController', () => {
  const service = {
    adherencia: jest.fn(),
    porMedicamento: jest.fn(),
    patrones: jest.fn(),
    historial: jest.fn(),
    resumen: jest.fn(),
    exportarPdf: jest
      .fn()
      .mockResolvedValue({ buffer: Buffer.from('%PDF'), filename: 'r.pdf' }),
  };
  const controller = new ReportesController(
    service as unknown as ReportesService,
  );
  const query = { periodo: Periodo.MES };

  it('delega los reportes en ReportesService', async () => {
    await controller.adherencia(FAMILY, query);
    await controller.porMedicamento(FAMILY, query);
    await controller.patrones(FAMILY, query);
    await controller.historial(FAMILY, { page: 1, size: 10 });
    await controller.resumen(FAMILY, { pacienteId: 'p1' });
    expect(service.adherencia).toHaveBeenCalledWith(FAMILY, query);
    expect(service.porMedicamento).toHaveBeenCalledWith(FAMILY, query);
    expect(service.patrones).toHaveBeenCalledWith(FAMILY, query);
    expect(service.historial).toHaveBeenCalledWith(FAMILY, {
      page: 1,
      size: 10,
    });
    expect(service.resumen).toHaveBeenCalledWith(FAMILY, 'p1');
  });

  it('exportarPdf devuelve un StreamableFile descargable', async () => {
    const file = await controller.exportarPdf(FAMILY, query);
    expect(file).toBeInstanceOf(StreamableFile);
    expect(file.getHeaders()).toMatchObject({
      type: 'application/pdf',
      disposition: 'attachment; filename="r.pdf"',
      length: 4,
    });
  });
});
