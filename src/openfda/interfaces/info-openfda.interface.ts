/** Información farmacológica extraída (y cacheada) de openFDA. */
export interface InfoOpenFda {
  encontrado: boolean;
  /** Término con el que se encontró el medicamento en openFDA. */
  terminoBusqueda?: string;
  nombreGenerico?: string;
  advertencias: string[];
  interacciones: string[];
  reaccionesAdversas: string[];
  indicaciones: string[];
  dosificacion: string[];
  /** Mensaje informativo para el usuario (p. ej. "no se encontró información"). */
  mensaje?: string;
  fuente: 'openFDA' | 'seed' | 'deshabilitado';
  consultadoEn: string;
}
