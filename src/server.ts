// HTTP 服务器模式入口
import PlaywrightServer from './server/playwright-server.js';
import os from 'os';
import path from 'path';

// 从环境变量读取配置
const options = {
  headless: process.env.HEADLESS === 'true',
  chromium: process.env.CHROMIUM === 'true',
  userProfile: process.env.NO_USER_PROFILE !== 'true',
  userDataDir: process.env.USER_DATA_DIR || path.join(os.homedir(), '.better-playwright-mcp-data'),
};

const port = parseInt(process.env.PORT || '3102', 10);

console.log('🚀 启动 Better Playwright HTTP 服务器...');
console.log('🔧 浏览器配置:');
console.log(`  - 模式: ${options.userProfile ? '持久化用户配置' : '标准模式'}`);
console.log(`  - 浏览器: ${options.chromium ? 'Chromium' : 'Chrome'}`);
console.log(`  - 显示模式: ${options.headless ? '无头模式' : '有头模式'}`);
if (options.userProfile) {
  console.log(`  - 用户数据目录: ${options.userDataDir}`);
}
console.log('');

const server = new PlaywrightServer(options);
server.start(port).catch(console.error);

// 优雅关闭处理
const gracefulShutdown = async (signal: string) => {
  console.log(`\n📴 收到 ${signal} 信号，正在关闭服务器...`);
  try {
    await server.shutdown();
    console.log('✅ 服务器已安全关闭');
    process.exit(0);
  } catch (error) {
    console.error('❌ 关闭服务器时出错:', error);
    process.exit(1);
  }
};

// 监听各种退出信号
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // 进程终止
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT')); // 退出信号

// 处理未捕获的异常
process.on('uncaughtException', async (error) => {
  console.error('❌ 未捕获的异常:', error);
  await gracefulShutdown('uncaughtException');
});

// 处理未处理的 Promise 拒绝
process.on('unhandledRejection', async (reason, promise) => {
  console.error('❌ 未处理的 Promise 拒绝:', reason);
  console.error('Promise:', promise);
  await gracefulShutdown('unhandledRejection');
});