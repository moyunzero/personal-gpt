import AppDataSource from "./data-source";

/** Next.js Route Handler 中懒初始化 TypeORM（避免模块加载时连库） */
export async function getDataSource() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  return AppDataSource;
}
