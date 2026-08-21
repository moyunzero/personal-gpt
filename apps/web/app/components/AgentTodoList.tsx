"use client";

import type { UIMessage } from "ai";

export type TodoStatus = "pending" | "active" | "completed";

export type TodoItem = {
  id: string;
  label: string;
  status: TodoStatus;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 从 message.parts 提取最新 data-todo-update */
export function extractTodos(message: UIMessage): TodoItem[] {
  let todos: TodoItem[] = [];
  for (const part of message.parts) {
    if (!("type" in part) || part.type !== "data-todo-update") continue;
    const data = "data" in part ? part.data : undefined;
    if (!isRecord(data) || !Array.isArray(data.todos)) continue;
    const parsed: TodoItem[] = [];
    for (const raw of data.todos) {
      if (!isRecord(raw)) continue;
      const label = typeof raw.label === "string" ? raw.label : "";
      if (!label) continue;
      const statusRaw = typeof raw.status === "string" ? raw.status : "pending";
      const status: TodoStatus =
        statusRaw === "active" || statusRaw === "completed" || statusRaw === "pending"
          ? statusRaw
          : "pending";
      parsed.push({
        id: typeof raw.id === "string" ? raw.id : `todo-${parsed.length}`,
        label,
        status,
      });
    }
    todos = parsed;
  }
  return todos;
}

export default function AgentTodoList({ message }: { message: UIMessage }) {
  const todos = extractTodos(message);
  if (todos.length === 0) return null;

  return (
    <div className="agent-block" aria-label="待办">
      <p className="agent-block-label">待办</p>
      <ul className="agent-todo-list">
        {todos.map((todo) => (
          <li key={todo.id} className="agent-todo-item">
            <span
              className={`agent-todo-check agent-todo-check-${todo.status}`}
              aria-hidden="true"
            />
            <span>{todo.label}</span>
            {todo.status === "active" ? (
              <span className="agent-todo-status-text">进行中</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
