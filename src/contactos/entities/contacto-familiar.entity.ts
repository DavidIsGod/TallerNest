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
import { Usuario } from '../../users/entities/usuario.entity';

@Entity('contactos_familiares')
@Unique('uq_contacto_paciente_usuario', ['pacienteId', 'usuarioId'])
export class ContactoFamiliar {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_contacto_paciente')
  @Column({ name: 'paciente_id', type: 'uuid' })
  pacienteId: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paciente_id' })
  paciente: Usuario;

  /** Usuario del sistema (ROLE_FAMILY) vinculado al contacto, si tiene cuenta. */
  @Index('idx_contacto_usuario')
  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId: string | null;

  @ManyToOne(() => Usuario, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario | null;

  @Column({ type: 'varchar', length: 150 })
  nombre: string;

  @Column({ type: 'varchar', length: 50 })
  relacion: string;

  /** Teléfono en formato E.164 (p. ej. +573001234567). */
  @Column({ type: 'varchar', length: 20 })
  telefono: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email: string | null;

  @Column({ name: 'es_emergencia', type: 'boolean', default: false })
  esEmergencia: boolean;

  @Column({ name: 'recibe_notificaciones', type: 'boolean', default: true })
  recibeNotificaciones: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
