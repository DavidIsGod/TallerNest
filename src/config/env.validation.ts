import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().uri().optional(),
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().default('postgres'),
  DB_PASSWORD: Joi.string().allow('').default('postgres'),
  DB_NAME: Joi.string().default('mediplan'),
  DB_SSL: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),
  DB_DROP_SCHEMA: Joi.boolean().default(false),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL_SECONDS: Joi.number().default(900),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_TTL_SECONDS: Joi.number().default(604800),
  BCRYPT_ROUNDS: Joi.number().min(4).max(15).default(12),
  TWO_FACTOR_APP_NAME: Joi.string().default('MediPlan'),

  ADMIN_EMAIL: Joi.string().email().default('admin@mediplan.com'),
  ADMIN_PASSWORD: Joi.string().min(8).default('Admin123*'),
  ADMIN_NAME: Joi.string().default('Administrador MediPlan'),

  APP_TIMEZONE: Joi.string().default('America/Bogota'),
  OMISION_HORAS: Joi.number().min(0).default(2),
  SCHEDULER_ENABLED: Joi.boolean().default(true),

  OPENFDA_ENABLED: Joi.boolean().default(true),
  OPENFDA_BASE_URL: Joi.string().uri().default('https://api.fda.gov'),
  OPENFDA_API_KEY: Joi.string().allow('').optional(),
  OPENFDA_TIMEOUT_MS: Joi.number().default(5000),

  TWILIO_ACCOUNT_SID: Joi.string().allow('').optional(),
  TWILIO_AUTH_TOKEN: Joi.string().allow('').optional(),
  TWILIO_FROM_NUMBER: Joi.string().allow('').optional(),
  TWILIO_CHANNEL: Joi.string().valid('sms', 'whatsapp').default('sms'),
  NOTIFICACION_MAX_INTENTOS: Joi.number().min(1).default(3),

  CORS_ORIGINS: Joi.string().default('*'),
  THROTTLE_TTL_MS: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(100),
  LOGIN_THROTTLE_LIMIT: Joi.number().default(5),
});
