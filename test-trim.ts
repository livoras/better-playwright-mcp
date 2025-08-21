import { PlaywrightClient } from './src/client/playwright-client';

async function testTrimParameter() {
  const client = new PlaywrightClient('http://localhost:3102');
  
  try {
    console.log('🚀 启动测试...\n');
    
    // 创建测试页面
    console.log('📄 创建测试页面...');
    const page = await client.createPage('test-trim', 'Test trim parameter');
    const pageId = page.pageId;
    console.log(`✅ 页面创建成功，ID: ${pageId}\n`);
    
    // 导航到一个包含很多嵌套元素的页面
    console.log('🌐 导航到测试页面...');
    await client.browserNavigate(pageId, 'https://example.com');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✅ 导航完成\n');
    
    // 测试 trim=true（默认）
    console.log('🧹 测试 trim=true（默认剪枝）...');
    const resultWithTrim = await client.pageToHtmlFile(pageId);
    console.log('结果（trim=true）:');
    console.log(`  - 文件路径: ${resultWithTrim.filePath}`);
    console.log(`  - 文件大小: ${resultWithTrim.metadata.fileSize} bytes`);
    console.log(`  - XPath映射数: ${resultWithTrim.metadata.mappingCount}`);
    console.log(`  - 已剪枝: ${resultWithTrim.metadata.trimmed}`);
    console.log();
    
    // 测试 trim=false
    console.log('📋 测试 trim=false（保留原始HTML）...');
    const resultNoTrim = await client.pageToHtmlFile(pageId, false);
    console.log('结果（trim=false）:');
    console.log(`  - 文件路径: ${resultNoTrim.filePath}`);
    console.log(`  - 文件大小: ${resultNoTrim.metadata.fileSize} bytes`);
    console.log(`  - XPath映射数: ${resultNoTrim.metadata.mappingCount}`);
    console.log(`  - 已剪枝: ${resultNoTrim.metadata.trimmed}`);
    console.log();
    
    // 比较结果
    console.log('📊 比较结果:');
    const sizeReduction = ((resultNoTrim.metadata.fileSize - resultWithTrim.metadata.fileSize) / resultNoTrim.metadata.fileSize * 100).toFixed(2);
    console.log(`  - 原始大小: ${resultNoTrim.metadata.fileSize} bytes`);
    console.log(`  - 剪枝后大小: ${resultWithTrim.metadata.fileSize} bytes`);
    console.log(`  - 减少: ${sizeReduction}%`);
    
    // 清理
    console.log('\n🧹 清理页面...');
    await client.closePage(pageId);
    console.log('✅ 测试完成！');
    
  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

// 运行测试
testTrimParameter();