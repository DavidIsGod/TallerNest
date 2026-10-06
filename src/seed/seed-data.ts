import { Role } from '../common/enums/role.enum';
import { InfoOpenFda } from '../openfda/interfaces/info-openfda.interface';

/**
 * Secreto TOTP fijo del usuario de demostración con 2FA. Agréguelo
 * manualmente en Google Authenticator / Authy ("ingresar clave") para
 * generar los códigos.
 */
export const DEMO_2FA_SECRET = 'KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD';

export interface SeedUsuario {
  key: string;
  nombre: string;
  email: string;
  password: string;
  rol: Role;
  telefono?: string;
  twoFactorSecret?: string;
}

export const SEED_USUARIOS: SeedUsuario[] = [
  {
    key: 'cuidador',
    nombre: 'María Gómez',
    email: 'cuidador@mediplan.com',
    password: 'Cuidador123*',
    rol: Role.CAREGIVER,
    telefono: '+573001112233',
  },
  {
    key: 'cuidador2fa',
    nombre: 'Jorge Ramírez',
    email: 'cuidador2fa@mediplan.com',
    password: 'Cuidador123*',
    rol: Role.CAREGIVER,
    telefono: '+573004445566',
    twoFactorSecret: DEMO_2FA_SECRET,
  },
  {
    key: 'familiar',
    nombre: 'Andrés Gómez',
    email: 'familiar@mediplan.com',
    password: 'Familiar123*',
    rol: Role.FAMILY,
    telefono: '+573007778899',
  },
  {
    key: 'familiar2',
    nombre: 'Lucía Ramírez',
    email: 'familiar2@mediplan.com',
    password: 'Familiar123*',
    rol: Role.FAMILY,
    telefono: '+573101234567',
  },
];

export interface SeedMedicamento {
  paciente: string;
  nombre: string;
  principioActivo: string;
  dosis: string;
  frecuencia: string;
  horarios: string[];
  diasDesdeInicio: number;
  diasHastaFin: number | null;
  instrucciones?: string;
  /** Probabilidad de que una toma histórica quede OMITIDA. */
  tasaOmision: number;
}

export const SEED_MEDICAMENTOS: SeedMedicamento[] = [
  {
    paciente: 'cuidador',
    nombre: 'Glucophage',
    principioActivo: 'metformina',
    dosis: '850 mg',
    frecuencia: 'Cada 12 horas',
    horarios: ['08:00', '20:00'],
    diasDesdeInicio: 45,
    diasHastaFin: null,
    instrucciones: 'Tomar con alimentos',
    tasaOmision: 0.12,
  },
  {
    paciente: 'cuidador',
    nombre: 'Cozaar',
    principioActivo: 'losartán',
    dosis: '50 mg',
    frecuencia: 'Una vez al día',
    horarios: ['08:00'],
    diasDesdeInicio: 60,
    diasHastaFin: null,
    tasaOmision: 0.05,
  },
  {
    paciente: 'cuidador',
    nombre: 'Lipitor',
    principioActivo: 'atorvastatina',
    dosis: '20 mg',
    frecuencia: 'Una vez al día (noche)',
    horarios: ['21:00'],
    diasDesdeInicio: 40,
    diasHastaFin: null,
    tasaOmision: 0.25,
  },
  {
    paciente: 'cuidador',
    nombre: 'Eutirox',
    principioActivo: 'levotiroxina',
    dosis: '50 mcg',
    frecuencia: 'Una vez al día (ayunas)',
    horarios: ['06:00'],
    diasDesdeInicio: 30,
    diasHastaFin: null,
    instrucciones: 'En ayunas, 30 minutos antes del desayuno',
    tasaOmision: 0.08,
  },
  {
    paciente: 'cuidador2fa',
    nombre: 'Enalapril MK',
    principioActivo: 'enalapril',
    dosis: '10 mg',
    frecuencia: 'Cada 12 horas',
    horarios: ['07:00', '19:00'],
    diasDesdeInicio: 30,
    diasHastaFin: null,
    tasaOmision: 0.1,
  },
  {
    paciente: 'cuidador2fa',
    nombre: 'Omeprazol',
    principioActivo: 'omeprazol',
    dosis: '20 mg',
    frecuencia: 'Una vez al día',
    horarios: ['07:00'],
    diasDesdeInicio: 20,
    diasHastaFin: 5,
    tasaOmision: 0.15,
  },
];

export interface SeedContacto {
  paciente: string;
  usuario?: string;
  nombre: string;
  relacion: string;
  telefono: string;
  email?: string;
  esEmergencia: boolean;
  recibeNotificaciones: boolean;
}

export const SEED_CONTACTOS: SeedContacto[] = [
  {
    paciente: 'cuidador',
    usuario: 'familiar',
    nombre: 'Andrés Gómez',
    relacion: 'Hijo',
    telefono: '+573007778899',
    email: 'familiar@mediplan.com',
    esEmergencia: true,
    recibeNotificaciones: true,
  },
  {
    paciente: 'cuidador',
    nombre: 'Carmen Gómez',
    relacion: 'Hermana',
    telefono: '+573159876543',
    esEmergencia: false,
    recibeNotificaciones: false,
  },
  {
    paciente: 'cuidador2fa',
    usuario: 'familiar2',
    nombre: 'Lucía Ramírez',
    relacion: 'Hija',
    telefono: '+573101234567',
    email: 'familiar2@mediplan.com',
    esEmergencia: true,
    recibeNotificaciones: true,
  },
];

export function infoOpenFdaDemo(principioActivo: string): InfoOpenFda {
  return {
    encontrado: true,
    terminoBusqueda: principioActivo,
    nombreGenerico: principioActivo.toUpperCase(),
    advertencias: [
      'Información de demostración generada por el seed. Cree un medicamento nuevo para ver los datos reales de openFDA.',
    ],
    interacciones: [],
    reaccionesAdversas: [],
    indicaciones: [],
    dosificacion: [],
    fuente: 'seed',
    consultadoEn: new Date().toISOString(),
  };
}

/** Generador pseudoaleatorio determinístico (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
