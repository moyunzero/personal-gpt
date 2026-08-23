import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { ChatSessionEntity } from "./chat-session.entity";

@Entity("chat_messages")
export class ChatMessageEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "session_id", type: "uuid" })
  sessionId!: string;

  @ManyToOne(() => ChatSessionEntity, (session) => session.messages, { onDelete: "CASCADE" })
  @JoinColumn({ name: "session_id" })
  session!: ChatSessionEntity;

  @Column({ type: "varchar" })
  role!: "user" | "assistant";

  @Column({ type: "text" })
  content!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
