import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InfoOpenFda } from './interfaces/info-openfda.interface';
import { candidatosDeBusqueda, normalizarTexto } from './principios-activos';

interface OpenFdaLabel {
  warnings?: string[];
  boxed_warning?: string[];
  drug_interactions?: string[];
  adverse_reactions?: string[];
  indications_and_usage?: string[];
  dosage_and_administration?: string[];
  openfda?: { generic_name?: string[] };
}

interface OpenFdaResponse {
  results?: OpenFdaLabel[];
}

export interface MedicamentoReferencia {
  id: string;
  nombre: string;
  principioActivo: string;
}

export interface AlertaInteraccion {
  medicamentoId: string;
  nombre: string;
  principioActivo: string;
  detalle: string;
}

const MAX_TEXT_LENGTH = 1500;

/**
 * Cliente de openFDA (Drug Label API): https://api.fda.gov/drug/label.json
 * Nunca lanza excepciones: si la API falla el medicamento se registra igual
 * y se informa que no se encontró información farmacológica.
 */
@Injectable()
export class OpenFdaService {
  private readonly logger = new Logger(OpenFdaService.name);

  constructor(private readonly config: ConfigService) {}

  async consultar(principioActivo: string): Promise<InfoOpenFda> {
    if (!this.config.get<boolean>('OPENFDA_ENABLED')) {
      return this.vacio(
        'deshabilitado',
        'La consulta a openFDA está deshabilitada en este entorno',
      );
    }

    for (const termino of candidatosDeBusqueda(principioActivo)) {
      try {
        const label = await this.buscarEtiqueta(termino);
        if (label) return this.mapear(label, termino);
      } catch (error) {
        this.logger.warn(
          `openFDA no disponible (${termino}): ${(error as Error).message}`,
        );
        return this.vacio(
          'openFDA',
          'No fue posible consultar openFDA en este momento',
        );
      }
    }
    return this.vacio(
      'openFDA',
      'No se encontró información farmacológica en openFDA para este principio activo',
    );
  }

  /**
   * Cruza el texto de interacciones de openFDA con los demás medicamentos
   * activos del paciente.
   */
  detectarInteracciones(
    info: InfoOpenFda | null,
    otros: MedicamentoReferencia[],
  ): AlertaInteraccion[] {
    if (!info?.encontrado || info.interacciones.length === 0) return [];
    const texto = normalizarTexto(info.interacciones.join(' '));
    const alertas: AlertaInteraccion[] = [];
    for (const med of otros) {
      const termino = candidatosDeBusqueda(med.principioActivo).find(
        (t) => t.length >= 4 && texto.includes(t),
      );
      if (termino) {
        alertas.push({
          medicamentoId: med.id,
          nombre: med.nombre,
          principioActivo: med.principioActivo,
          detalle: this.extraerContexto(texto, termino),
        });
      }
    }
    return alertas;
  }

  private async buscarEtiqueta(termino: string): Promise<OpenFdaLabel | null> {
    const baseUrl = this.config.get<string>(
      'OPENFDA_BASE_URL',
      'https://api.fda.gov',
    );
    const params = new URLSearchParams({
      search: `openfda.generic_name:"${termino}"`,
      limit: '1',
    });
    const apiKey = this.config.get<string>('OPENFDA_API_KEY');
    if (apiKey) params.set('api_key', apiKey);

    const response = await fetch(`${baseUrl}/drug/label.json?${params}`, {
      signal: AbortSignal.timeout(
        Number(this.config.get<number>('OPENFDA_TIMEOUT_MS') ?? 5000),
      ),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as OpenFdaResponse;
    return body.results?.[0] ?? null;
  }

  private mapear(label: OpenFdaLabel, termino: string): InfoOpenFda {
    const limpiar = (values?: string[]) =>
      (values ?? []).map((v) =>
        v.length > MAX_TEXT_LENGTH ? `${v.slice(0, MAX_TEXT_LENGTH)}…` : v,
      );
    return {
      encontrado: true,
      terminoBusqueda: termino,
      nombreGenerico: label.openfda?.generic_name?.[0],
      advertencias: limpiar([
        ...(label.boxed_warning ?? []),
        ...(label.warnings ?? []),
      ]),
      interacciones: limpiar(label.drug_interactions),
      reaccionesAdversas: limpiar(label.adverse_reactions),
      indicaciones: limpiar(label.indications_and_usage),
      dosificacion: limpiar(label.dosage_and_administration),
      fuente: 'openFDA',
      consultadoEn: new Date().toISOString(),
    };
  }

  private vacio(fuente: InfoOpenFda['fuente'], mensaje: string): InfoOpenFda {
    return {
      encontrado: false,
      advertencias: [],
      interacciones: [],
      reaccionesAdversas: [],
      indicaciones: [],
      dosificacion: [],
      mensaje,
      fuente,
      consultadoEn: new Date().toISOString(),
    };
  }

  private extraerContexto(texto: string, termino: string): string {
    const idx = texto.indexOf(termino);
    const inicio = Math.max(0, idx - 120);
    return `…${texto.slice(inicio, idx + termino.length + 120)}…`;
  }
}
