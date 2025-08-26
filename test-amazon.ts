import { PlaywrightClient } from './src/client/playwright-client';

async function searchAmazonAndGetOutline() {
  const client = new PlaywrightClient('http://localhost:3102');
  
  try {
    console.log('Creating page and navigating to Amazon...');
    const { pageId } = await client.createPage(
      'amazon-search',
      'Amazon search for curling irons',
      'https://www.amazon.com'
    );
    
    console.log('Page created with ID:', pageId);
    
    // Wait for page to load
    await client.waitForTimeout(pageId, 3000);
    
    // Search for curling irons
    console.log('Looking for search box...');
    const searchBoxGrep = await client.grepSnapshot(pageId, 'searchbox', '-n -m 5');
    console.log('Search box grep results:', searchBoxGrep);
    
    // Type in search box - Amazon's search box usually has ref like 'e1' or similar low numbers
    console.log('Typing in search box...');
    await client.browserType(pageId, 'e91', '卷发棒');
    
    // Press Enter or click search button
    console.log('Submitting search...');
    await client.browserPressKey(pageId, 'Enter');
    
    // Wait for results to load
    console.log('Waiting for search results...');
    await client.waitForTimeout(pageId, 5000);
    
    // Get outline of search results page (fixed 100 lines)
    console.log('Getting page outline...');
    const outline = await client.getOutline(pageId);
    
    // Save outline to file
    const fs = await import('fs/promises');
    await fs.writeFile('/Users/djh/git/better-playwright-mcp/outline.txt', outline, 'utf-8');
    console.log('Outline saved to outline.txt');
    
    // Also print a preview
    console.log('\n=== Outline Preview (first 50 lines) ===');
    console.log(outline.split('\n').slice(0, 50).join('\n'));
    
    console.log('\nFull outline has been saved to outline.txt');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

searchAmazonAndGetOutline();