import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InfoOpenFda } from '../../openfda/interfaces/info-openfda.interface';
import { Usuario } from '../../users/entities/usuario.entity';

@Entity('medicamentos')
export class Medicamento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  nombre: string;

  @Column({ name: 'principio_activo', type: 'varchar', length: 200 })
  principioActivo: string;

  @Column({ type: 'varchar', length: 100 })
  dosis: string;

  @Column({ type: 'varchar', length: 50 })
  frecuencia: string;

  /** Horarios de toma en formato HH:mm (24 h), p. ej. ["08:00","20:00"]. */
  @Column({ type: 'jsonb' })
  horarios: string[];

  @Column({ name: 'fecha_inicio', type: 'date' })
  fechaInicio: string;

  /** null = tratamiento de duración indefinida (crónico). */
  @Column({ name: 'fecha_fin', type: 'date', nullable: true })
  fechaFin: string | null;

  @Column({ type: 'text', nullable: true })
  instrucciones: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({ name: 'info_openfda', type: 'jsonb', nullable: true })
  infoOpenfda: InfoOpenFda | null;

  @Index('idx_medicamento_paciente')
  @Column({ name: 'paciente_id', type: 'uuid' })
  pacienteId: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paciente_id' })
  paciente: Usuario;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
