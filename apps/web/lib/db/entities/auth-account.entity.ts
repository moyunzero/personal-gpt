import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

import { UserEntity } from "./user.entity";

const bigintTransformer = {
  to: (value?: number | null) => (value == null ? null : String(value)),
  from: (value?: string | null) => (value == null ? null : Number.parseInt(value, 10)),
};

@Entity("accounts")
export class AuthAccountEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "userId", type: "uuid" })
  userId!: string;

  @Column({ type: "varchar" })
  type!: string;

  @Column({ type: "varchar" })
  provider!: string;

  @Column({ type: "varchar" })
  providerAccountId!: string;

  @Column({ type: "varchar", nullable: true })
  refresh_token!: string | null;

  @Column({ type: "varchar", nullable: true })
  access_token!: string | null;

  @Column({ type: "bigint", nullable: true, transformer: bigintTransformer })
  expires_at!: number | null;

  @Column({ type: "varchar", nullable: true })
  token_type!: string | null;

  @Column({ type: "varchar", nullable: true })
  scope!: string | null;

  @Column({ type: "varchar", nullable: true })
  id_token!: string | null;

  @Column({ type: "varchar", nullable: true })
  session_state!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: UserEntity;
}
