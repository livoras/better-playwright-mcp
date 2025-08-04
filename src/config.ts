// 共享配置
export interface Config {
  snapshotDir?: string;
  maxTokens: number;
}

export const defaultConfig: Config = {
  snapshotDir: process.env.SNAPSHOT_DIR,
  maxTokens: 20000,
};