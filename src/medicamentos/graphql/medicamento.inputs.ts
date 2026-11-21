import { Field, InputType, Int } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsFecha } from '../../common/decorators/is-fecha.decorator';
import { HORA_REGEX } from '../dto/create-medicamento.dto';

/*
 * TIPOS DE ENTRADA del esquema GraphQL (lo que el cliente envía como argumento).
 * @InputType() es el equivalente al DTO del @Body() en REST, y lleva las
 * mismas validaciones de class-validator (las ejecuta el ValidationPipe global).
 */

@InputType({ description: 'Filtros y paginación del listado de medicamentos' })
export class FiltrosMedicamentosInput {
  @Field(() => Int, { defaultValue: 1 })
  @IsInt()
  @Min(1)
  pagina: number = 1;

  @Field(() => Int, { defaultValue: 10 })
  @IsInt()
  @Min(1)
  @Max(100)
  tamano: number = 10;

  @Field({ nullable: true, description: 'Busca por nombre o principio activo' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string;

  @Field({ nullable: true, description: 'true = activos, false = inactivos' })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

@InputType({ description: 'Datos para crear o editar un medicamento' })
export class MedicamentoInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  principioActivo: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  dosis: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  frecuencia: string;

  @Field(() => [String])
  @IsArray()
  @ArrayNotEmpty({ message: 'Debe indicar al menos un horario' })
  @ArrayMaxSize(24)
  @ArrayUnique({ message: 'Los horarios no pueden repetirse' })
  @Matches(HORA_REGEX, {
    each: true,
    message: 'Cada horario debe tener formato HH:mm (24 horas)',
  })
  horarios: string[];

  @Field()
  @IsFecha()
  fechaInicio: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsFecha()
  fechaFin?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  instrucciones?: string;
}
