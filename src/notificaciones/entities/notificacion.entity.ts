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
import { ContactoFamiliar } from '../../contactos/entities/contacto-familiar.entity';
import { RegistroToma } from '../../tomas/entities/registro-toma.entity';
import { Usuario } from '../../users/entities/usuario.entity';
import {
  CanalNotificacion,
  EstadoNotificacion,
  TipoNotificacion,
} from '../enums';

/** Registro de cada mensaje enviado (o intentado) vía Twilio. */
@Entity('notificaciones')
export class Notificacion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_notificacion_paciente')
  @Column({ name: 'paciente_id', type: 'uuid' })
  pacienteId: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paciente_id' })
  paciente: Usuario;

  @Column({ name: 'contacto_id', type: 'uuid', nullable: true })
  contactoId: string | null;

  @ManyToOne(() => ContactoFamiliar, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'contacto_id' })
  contacto: ContactoFamiliar | null;

  @Column({ name: 'registro_toma_id', type: 'uuid', nullable: true })
  registroTomaId: string | null;

  @ManyToOne(() => RegistroToma, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'registro_toma_id' })
  registroToma: RegistroToma | null;

  @Column({
    type: 'enum',
    enum: TipoNotificacion,
    enumName: 'notificacion_tipo_enum',
  })
  tipo: TipoNotificacion;

  @Column({
    type: 'enum',
    enum: CanalNotificacion,
    enumName: 'notificacion_canal_enum',
  })
  canal: CanalNotificacion;

  @Column({ type: 'varchar', length: 40 })
  destino: string;

  @Column({ type: 'text' })
  mensaje: string;

  @Index('idx_notificacion_estado')
  @Column({
    type: 'enum',
    enum: EstadoNotificacion,
    enumName: 'notificacion_estado_enum',
  })
  estado: EstadoNotificacion;

  /** Estado reportado por Twilio (queued, sent, delivered, failed...). */
  @Column({
    name: 'estado_proveedor',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  estadoProveedor: string | null;

  /** SID del mensaje en Twilio. */
  @Column({
    name: 'proveedor_sid',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  proveedorSid: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'int', default: 1 })
  intentos: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
