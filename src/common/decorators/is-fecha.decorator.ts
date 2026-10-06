import { applyDecorators } from '@nestjs/common';
import { IsISO8601, Matches } from 'class-validator';

/** Valida una fecha calendario 'YYYY-MM-DD'. */
export const IsFecha = () =>
  applyDecorators(
    Matches(/^\d{4}-\d{2}-\d{2}$/, {
      message: '$property debe tener formato YYYY-MM-DD',
    }),
    IsISO8601(
      { strict: true },
      { message: '$property no es una fecha válida' },
    ),
  );
