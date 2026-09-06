import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

const dateTransformer = {
  to: (value?: Date | string | null) =>
    value == null ? null : value instanceof Date ? String(value.valueOf()) : String(value),
  from: (value?: string | null) => (value == null ? null : new Date(Number.parseInt(value, 10))),
};

@Entity("verification_tokens")
export class AuthVerificationTokenEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  token!: string;

  @Column({ type: "varchar" })
  identifier!: string;

  @Column({ type: "varchar", transformer: dateTransformer })
  expires!: string;
}
