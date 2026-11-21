import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

/*
 * TIPOS DE SALIDA del esquema GraphQL (lo que el servidor puede devolver).
 *
 * Enfoque "Code First": estas clases con decoradores generan el archivo
 * src/schema.gql al arrancar. Reglas para leerlas:
 *   - @ObjectType('Medicamento')  →  type Medicamento { ... }
 *   - @Field(() => String)        →  campo obligatorio: String!
 *   - { nullable: true }          →  campo opcional:    String   (sin "!")
 *   - () => [String]              →  lista:             [String!]!
 *
 * Los nombres siguen el DOMINIO (lo que el frontend entiende), no las
 * columnas de la tabla: no se exponen paciente_id, info_openfda, created_at...
 */

@ObjectType('Medicamento', {
  description: 'Un medicamento del tratamiento del paciente',
})
export class MedicamentoType {
  @Field(() => ID)
  id: string;

  @Field()
  nombre: string;

  @Field({ description: 'Principio activo (se usa para consultar openFDA)' })
  principioActivo: string;

  @Field()
  dosis: string;

  @Field()
  frecuencia: string;

  @Field(() => [String], { description: 'Horarios de toma en formato HH:mm' })
  horarios: string[];

  @Field({ description: 'Fecha de inicio (YYYY-MM-DD)' })
  fechaInicio: string;

  @Field(() => String, {
    nullable: true,
    description: 'Fecha de fin (YYYY-MM-DD). null = tratamiento indefinido',
  })
  fechaFin: string | null;

  @Field(() => String, { nullable: true })
  instrucciones: string | null;

  @Field()
  activo: boolean;

  // "advertencias" NO es una columna: se calcula en el resolver a partir de la
  // información de openFDA (ver @ResolveField en medicamentos.resolver.ts).
}

/** Una página del listado. Relación: una página TIENE muchos Medicamento. */
@ObjectType('PaginaMedicamentos')
export class PaginaMedicamentosType {
  @Field(() => [MedicamentoType])
  items: MedicamentoType[];

  @Field(() => Int)
  pagina: number;

  @Field(() => Int)
  totalPaginas: number;

  @Field(() => Int)
  totalItems: number;
}
