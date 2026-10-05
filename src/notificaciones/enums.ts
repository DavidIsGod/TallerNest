export enum TipoNotificacion {
  DOSIS_OMITIDA = 'DOSIS_OMITIDA',
  RESUMEN_DIARIO = 'RESUMEN_DIARIO',
}

export enum EstadoNotificacion {
  /** Aceptada por Twilio. */
  ENVIADA = 'ENVIADA',
  /** Twilio rechazó el mensaje o hubo error de red (se reintenta). */
  FALLIDA = 'FALLIDA',
  /** Twilio no está configurado: el mensaje solo se registra. */
  SIMULADA = 'SIMULADA',
}

export enum CanalNotificacion {
  SMS = 'SMS',
  WHATSAPP = 'WHATSAPP',
}
