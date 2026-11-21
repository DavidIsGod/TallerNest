import { ParseUUIDPipe } from '@nestjs/common';
import {
  Args,
  ID,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { Medicamento } from '../entities/medicamento.entity';
import { MedicamentosService } from '../medicamentos.service';
import {
  FiltrosMedicamentosInput,
  MedicamentoInput,
} from './medicamento.inputs';
import { MedicamentoType, PaginaMedicamentosType } from './medicamento.types';

/**
 * Puerta de entrada GraphQL de medicamentos: es el equivalente al
 * MedicamentosController de REST.
 *
 * - @Query    = operación de LECTURA   (como un GET)
 * - @Mutation = operación de ESCRITURA (como un POST, PUT o DELETE)
 *
 * No tiene lógica propia: cada método llama al MISMO MedicamentosService que
 * usa el controlador REST. La seguridad también es la misma: el guard global
 * de JWT exige el token y @Roles limita las mutaciones al cuidador.
 */
@Resolver(() => MedicamentoType)
export class MedicamentosResolver {
  constructor(private readonly medicamentosService: MedicamentosService) {}

  @Query(() => PaginaMedicamentosType, {
    name: 'medicamentos',
    description: 'Listado paginado de medicamentos del paciente',
  })
  async medicamentos(
    @CurrentUser() user: AuthenticatedUser,
    @Args('filtros') filtros: FiltrosMedicamentosInput,
  ): Promise<PaginaMedicamentosType> {
    const resultado = await this.medicamentosService.findAll(user, {
      page: filtros.pagina,
      size: filtros.tamano,
      nombre: filtros.nombre,
      activo: filtros.activo,
    });
    return {
      items: resultado.items,
      pagina: resultado.meta.page,
      totalPaginas: resultado.meta.totalPages,
      totalItems: resultado.meta.totalItems,
    };
  }

  @Query(() => MedicamentoType, {
    name: 'medicamento',
    description: 'Detalle de un medicamento por su id',
  })
  async medicamento(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
  ): Promise<Medicamento> {
    const { medicamento } = await this.medicamentosService.findOne(user, id);
    return medicamento;
  }

  @Mutation(() => MedicamentoType, {
    name: 'crearMedicamento',
    description: 'Registra un medicamento (solo el cuidador)',
  })
  @Roles(Role.CAREGIVER)
  async crearMedicamento(
    @CurrentUser() user: AuthenticatedUser,
    @Args('datos') datos: MedicamentoInput,
  ): Promise<Medicamento> {
    const { medicamento } = await this.medicamentosService.create(user, datos);
    return medicamento;
  }

  @Mutation(() => MedicamentoType, {
    name: 'actualizarMedicamento',
    description: 'Edita un medicamento (solo el cuidador)',
  })
  @Roles(Role.CAREGIVER)
  async actualizarMedicamento(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
    @Args('datos') datos: MedicamentoInput,
  ): Promise<Medicamento> {
    const { medicamento } = await this.medicamentosService.update(
      user,
      id,
      datos,
    );
    return medicamento;
  }

  @Mutation(() => Boolean, {
    name: 'eliminarMedicamento',
    description: 'Elimina (desactiva) un medicamento (solo el cuidador)',
  })
  @Roles(Role.CAREGIVER)
  async eliminarMedicamento(
    @CurrentUser() user: AuthenticatedUser,
    @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
  ): Promise<boolean> {
    await this.medicamentosService.remove(user, id);
    return true;
  }

  /**
   * Campo calculado: solo se ejecuta si la consulta pide "advertencias".
   * Sale de la información de openFDA guardada con el medicamento.
   */
  @ResolveField(() => [String], {
    description: 'Advertencias de openFDA sobre el principio activo',
  })
  advertencias(@Parent() medicamento: Medicamento): string[] {
    return medicamento.infoOpenfda?.advertencias ?? [];
  }
}
