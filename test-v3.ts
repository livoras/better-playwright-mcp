/**
 * Test script for v3 architecture
 * Tests the new Microsoft-based snapshot system with ref identifiers
 */

import { PlaywrightClient } from './dist/client/playwright-client.js';

async function test() {
  const client = new PlaywrightClient('http://localhost:3103');
  
  try {
    console.log('🧪 Testing v3 Architecture\n');
    console.log('='.repeat(50));
    
    // Test 1: Create page
    console.log('\n📋 Test 1: Create Page');
    const { pageId, snapshot } = await client.createPage(
      'test-page',
      'Test page for v3',
      'https://example.com'
    );
    
    console.log(`✅ Page created: ${pageId}`);
    console.log(`📍 URL: ${snapshot.url}`);
    console.log(`📄 Title: ${snapshot.title}`);
    
    // Test 2: Check snapshot format
    console.log('\n📋 Test 2: Snapshot Format');
    console.log('Snapshot preview (first 500 chars):');
    console.log(snapshot.snapshot.substring(0, 500));
    
    // Test 3: Parse refs from snapshot
    console.log('\n📋 Test 3: Ref Parsing');
    const refMatches = snapshot.snapshot.match(/\[ref=([^\]]+)\]/g);
    if (refMatches) {
      console.log(`✅ Found ${refMatches.length} refs:`);
      refMatches.slice(0, 5).forEach(ref => {
        console.log(`   ${ref}`);
      });
    } else {
      console.log('❌ No refs found in snapshot');
    }
    
    // Test 4: Click using ref (if found)
    if (refMatches && refMatches.length > 0) {
      console.log('\n📋 Test 4: Click Action');
      // Extract ref ID from first match
      const firstRef = refMatches[0].match(/\[ref=([^\]]+)\]/)?.[1];
      if (firstRef) {
        console.log(`🖱️ Attempting to click ref: ${firstRef}`);
        try {
          const clickResult = await client.click(pageId, firstRef, 'First element');
          console.log(`✅ Click successful`);
          console.log(`📍 New URL: ${clickResult.url}`);
        } catch (error: any) {
          console.log(`⚠️ Click failed: ${error.message}`);
        }
      }
    }
    
    // Test 5: Navigate
    console.log('\n📋 Test 5: Navigation');
    const navResult = await client.navigate(pageId, 'https://www.google.com');
    console.log(`✅ Navigated to: ${navResult.url}`);
    console.log(`📄 New title: ${navResult.title}`);
    
    // Test 6: Get fresh snapshot
    console.log('\n📋 Test 6: Fresh Snapshot');
    const freshSnapshot = await client.getSnapshot(pageId);
    const freshRefs = freshSnapshot.snapshot.match(/\[ref=([^\]]+)\]/g);
    if (freshRefs) {
      console.log(`✅ Fresh snapshot has ${freshRefs.length} refs`);
    }
    
    // Test 7: Screenshot
    console.log('\n📋 Test 7: Screenshot');
    const screenshot = await client.screenshot(pageId);
    console.log(`✅ Screenshot captured (${screenshot.length} bytes base64)`);
    
    // Test 8: List pages
    console.log('\n📋 Test 8: List Pages');
    const pages = await client.listPages();
    console.log(`✅ Found ${pages.length} page(s):`);
    pages.forEach(p => {
      console.log(`   - ${p.name}: ${p.url}`);
    });
    
    // Test 9: Close page
    console.log('\n📋 Test 9: Close Page');
    await client.closePage(pageId);
    console.log('✅ Page closed');
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests completed successfully!');
    
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
test().catch(console.error);