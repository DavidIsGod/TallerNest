import { TransformFnParams } from 'class-transformer';

/** Convierte 'true'/'false' de query string a boolean. */
export function toBoolean({ value }: TransformFnParams): unknown {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}
