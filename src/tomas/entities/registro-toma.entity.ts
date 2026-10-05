import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Medicamento } from '../../medicamentos/entities/medicamento.entity';
import { Usuario } from '../../users/entities/usuario.entity';
import { EstadoToma } from '../enums/estado-toma.enum';

@Entity('registros_toma')
@Unique('uq_toma_medicamento_fecha_hora', [
  'medicamentoId',
  'fecha',
  'horaProgramada',
])
@Index('idx_toma_paciente_fecha', ['pacienteId', 'fecha'])
export class RegistroToma {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_toma_medicamento')
  @Column({ name: 'medicamento_id', type: 'uuid' })
  medicamentoId: string;

  @ManyToOne(() => Medicamento, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'medicamento_id' })
  medicamento: Medicamento;

  @Column({ name: 'paciente_id', type: 'uuid' })
  pacienteId: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paciente_id' })
  paciente: Usuario;

  @Column({ type: 'date' })
  fecha: string;

  /** Hora programada 'HH:mm:ss' (zona horaria de la aplicación). */
  @Column({ name: 'hora_programada', type: 'time' })
  horaProgramada: string;

  /** Momento real en que se registró la toma (timestamp del servidor). */
  @Column({ name: 'hora_real', type: 'timestamptz', nullable: true })
  horaReal: Date | null;

  @Index('idx_toma_estado')
  @Column({
    type: 'enum',
    enum: EstadoToma,
    enumName: 'registro_toma_estado_enum',
    default: EstadoToma.PENDIENTE,
  })
  estado: EstadoToma;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @Column({ name: 'notificacion_enviada', type: 'boolean', default: false })
  notificacionEnviada: boolean;

  /** true si el scheduler la marcó como OMITIDO por vencimiento. */
  @Column({ name: 'omision_automatica', type: 'boolean', default: false })
  omisionAutomatica: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
