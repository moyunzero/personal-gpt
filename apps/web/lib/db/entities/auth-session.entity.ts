import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

import { UserEntity } from "./user.entity";

const dateTransformer = {
  to: (value?: Date | string | null) =>
    value == null ? null : value instanceof Date ? String(value.valueOf()) : String(value),
  from: (value?: string | null) => (value == null ? null : new Date(Number.parseInt(value, 10))),
};

@Entity("sessions")
export class AuthSessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", unique: true })
  sessionToken!: string;

  @Column({ name: "userId", type: "uuid" })
  userId!: string;

  @Column({ type: "varchar", transformer: dateTransformer })
  expires!: string;

  @ManyToOne(() => UserEntity, (user) => user.sessions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: UserEntity;
}
