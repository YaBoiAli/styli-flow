import { extractJsonLdProducts } from '../structured.ts';
import type { SourceFactory } from '../types.ts';
import { PageCrawlerSource } from './pageCrawler.ts';

/** schema.org Product JSON-LD published on product pages listed in the site's sitemaps. */
export const structuredDataSourceFactory: SourceFactory = {
  type: 'structured_data',
  create: (context) => new PageCrawlerSource('structured_data', context, extractJsonLdProducts),
};
