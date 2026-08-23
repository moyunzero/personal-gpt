import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { ChatMessageEntity } from "./chat-message.entity";

export type ChatSessionMode = "chat" | "agent";

@Entity("chat_sessions")
@Index("IDX_chat_sessions_user_workspace", ["userId", "workspaceId"])
export class ChatSessionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "thread_id", type: "varchar", unique: true })
  threadId!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "workspace_id", type: "uuid" })
  workspaceId!: string;

  @Column({ type: "varchar", default: "chat" })
  mode!: ChatSessionMode;

  @Column({ type: "varchar", default: "" })
  title!: string;

  @OneToMany(() => ChatMessageEntity, (message) => message.session)
  messages!: ChatMessageEntity[];

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
