import { extractMetaProduct } from '../structured.ts';
import type { SourceFactory } from '../types.ts';
import { PageCrawlerSource } from './pageCrawler.ts';

/**
 * Last on-site fallback: product meta tags (OpenGraph product:price etc.) on public product pages.
 * Uses the same polite fetcher, so robots.txt, rate limits and bot blocks are always respected.
 */
export const directWebsiteSourceFactory: SourceFactory = {
  type: 'direct_website',
  create: (context) =>
    new PageCrawlerSource('direct_website', context, (html, url) => {
      const product = extractMetaProduct(html, url);
      return product ? [product] : [];
    }),
};
