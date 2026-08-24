import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("users")
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", nullable: true })
  name!: string | null;

  @Column({ type: "varchar", nullable: true, unique: true })
  email!: string | null;

  @Column({ name: "emailVerified", type: "varchar", nullable: true })
  emailVerified!: string | null;

  @Column({ type: "varchar", nullable: true })
  image!: string | null;

  @Column({ name: "active_workspace_id", type: "uuid", nullable: true })
  activeWorkspaceId!: string | null;
}
