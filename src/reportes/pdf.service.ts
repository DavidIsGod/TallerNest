import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { shortTime } from '../common/utils/date.util';
import {
  AdherenciaMedicamento,
  ConteoEstados,
  PatronesOmision,
  TomaReporte,
} from './report-calculator';

export interface DatosReportePdf {
  paciente: { nombre: string; email: string };
  periodo: string;
  desde: string;
  hasta: string;
  global: ConteoEstados;
  porMedicamento: AdherenciaMedicamento[];
  patrones: PatronesOmision;
  historial: TomaReporte[];
  generadoEn: string;
}

const COLOR_PRIMARIO = '#003366';
const COLOR_SECUNDARIO = '#2E86AB';
const COLOR_TEXTO = '#222222';
const COLOR_GRIS = '#E8EEF4';
const MARGEN = 50;

const pct = (valor: number | null) =>
  valor === null ? 'N/A' : `${valor.toFixed(1)}%`;

/** Genera el reporte PDF de adherencia (resumen, gráfico y tablas). */
@Injectable()
export class PdfService {
  generarReporteAdherencia(datos: DatosReportePdf): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: MARGEN });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.encabezado(doc, datos);
      this.resumen(doc, datos.global);
      this.graficoPorMedicamento(doc, datos.porMedicamento);
      this.tablaPorMedicamento(doc, datos.porMedicamento);
      this.patrones(doc, datos.patrones);
      this.historial(doc, datos.historial);
      doc.end();
    });
  }

  private encabezado(doc: PDFKit.PDFDocument, d: DatosReportePdf) {
    doc
      .fillColor(COLOR_PRIMARIO)
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('MediPlan')
      .fontSize(14)
      .fillColor(COLOR_SECUNDARIO)
      .text('Reporte de adherencia al tratamiento')
      .moveDown(0.5)
      .font('Helvetica')
      .fontSize(10)
      .fillColor(COLOR_TEXTO)
      .text(`Paciente: ${d.paciente.nombre} (${d.paciente.email})`)
      .text(`Periodo: ${d.periodo} (${d.desde} a ${d.hasta})`)
      .text(`Generado: ${d.generadoEn}`)
      .moveDown();
  }

  private resumen(doc: PDFKit.PDFDocument, g: ConteoEstados) {
    this.titulo(doc, 'Adherencia global');
    doc
      .font('Helvetica-Bold')
      .fontSize(28)
      .fillColor(COLOR_PRIMARIO)
      .text(pct(g.adherencia))
      .font('Helvetica')
      .fontSize(10)
      .fillColor(COLOR_TEXTO)
      .text(
        `Programadas: ${g.total}   Tomadas: ${g.tomadas}   Omitidas: ${g.omitidas}   Pendientes: ${g.pendientes}`,
      )
      .text('Fórmula: (tomas TOMADO / total de tomas programadas) × 100')
      .moveDown();
  }

  private graficoPorMedicamento(
    doc: PDFKit.PDFDocument,
    meds: AdherenciaMedicamento[],
  ) {
    if (meds.length === 0) return;
    this.titulo(doc, 'Adherencia por medicamento');
    const anchoEtiqueta = 150;
    const anchoBarra = doc.page.width - MARGEN * 2 - anchoEtiqueta - 50;
    for (const m of meds) {
      this.saltoSiNecesario(doc, 20);
      const y = doc.y;
      const valor = m.adherencia ?? 0;
      doc
        .fontSize(9)
        .fillColor(COLOR_TEXTO)
        .text(m.nombre, MARGEN, y, {
          width: anchoEtiqueta - 10,
          ellipsis: true,
        });
      doc.rect(MARGEN + anchoEtiqueta, y, anchoBarra, 12).fill(COLOR_GRIS);
      doc
        .rect(MARGEN + anchoEtiqueta, y, (anchoBarra * valor) / 100, 12)
        .fill(valor >= 80 ? '#2A9D8F' : valor >= 60 ? '#E9C46A' : '#E76F51');
      doc
        .fillColor(COLOR_TEXTO)
        .text(pct(m.adherencia), MARGEN + anchoEtiqueta + anchoBarra + 5, y);
      doc.y = y + 18;
    }
    doc.x = MARGEN;
    doc.moveDown();
  }

  private tablaPorMedicamento(
    doc: PDFKit.PDFDocument,
    meds: AdherenciaMedicamento[],
  ) {
    if (meds.length === 0) return;
    this.tabla(
      doc,
      ['Medicamento', 'Dosis', 'Total', 'Tomadas', 'Omitidas', 'Adherencia'],
      [150, 90, 50, 60, 60, 80],
      meds.map((m) => [
        m.nombre,
        m.dosis,
        String(m.total),
        String(m.tomadas),
        String(m.omitidas),
        pct(m.adherencia),
      ]),
    );
  }

  private patrones(doc: PDFKit.PDFDocument, p: PatronesOmision) {
    this.titulo(doc, 'Patrones de omisión');
    doc
      .fontSize(10)
      .fillColor(COLOR_TEXTO)
      .text(`Total de omisiones: ${p.totalOmitidas}`)
      .text(`Día con más omisiones: ${p.peorDia ?? 'Sin omisiones'}`)
      .text(
        `Hora con más omisiones: ${p.peorHora === null ? 'Sin omisiones' : `${String(p.peorHora).padStart(2, '0')}:00`}`,
      )
      .moveDown(0.5);
    this.tabla(
      doc,
      ['Día', 'Programadas', 'Omitidas', 'Tasa de omisión'],
      [130, 100, 100, 120],
      p.porDia.map((d) => [
        d.nombre,
        String(d.total),
        String(d.omitidas),
        pct(d.tasaOmision),
      ]),
    );
  }

  private historial(doc: PDFKit.PDFDocument, tomas: TomaReporte[]) {
    if (tomas.length === 0) return;
    this.titulo(doc, `Historial (últimas ${tomas.length} tomas)`);
    this.tabla(
      doc,
      ['Fecha', 'Hora', 'Medicamento', 'Dosis', 'Estado'],
      [80, 50, 170, 100, 90],
      tomas.map((t) => [
        t.fecha,
        shortTime(t.horaProgramada),
        t.medicamento?.nombre ?? '',
        t.medicamento?.dosis ?? '',
        t.estado,
      ]),
    );
  }

  private titulo(doc: PDFKit.PDFDocument, texto: string) {
    this.saltoSiNecesario(doc, 60);
    doc.x = MARGEN;
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(COLOR_PRIMARIO)
      .text(texto)
      .font('Helvetica')
      .moveDown(0.3);
  }

  private tabla(
    doc: PDFKit.PDFDocument,
    columnas: string[],
    anchos: number[],
    filas: string[][],
  ) {
    const fila = (valores: string[], header: boolean) => {
      this.saltoSiNecesario(doc, 18);
      const y = doc.y;
      const anchoTotal = anchos.reduce((a, b) => a + b, 0);
      if (header) doc.rect(MARGEN, y - 2, anchoTotal, 16).fill(COLOR_PRIMARIO);
      let x = MARGEN;
      doc
        .font(header ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .fillColor(header ? '#FFFFFF' : COLOR_TEXTO);
      valores.forEach((v, i) => {
        doc.text(v, x + 3, y, {
          width: anchos[i] - 6,
          ellipsis: true,
          lineBreak: false,
        });
        x += anchos[i];
      });
      doc.y = y + 16;
    };
    fila(columnas, true);
    filas.forEach((f) => fila(f, false));
    doc.x = MARGEN;
    doc.moveDown();
  }

  private saltoSiNecesario(doc: PDFKit.PDFDocument, alto: number) {
    if (doc.y + alto > doc.page.height - MARGEN) doc.addPage();
  }
}
