import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/ops/',
          '/api/',
          '/login',
          '/register',
          '/payments/',
          '/checkout',
          '/b2b/dashboard',
          '/b2b/agreements',
          '/docs/',
          '/quotes/',
          '/track/',
        ],
      },
    ],
    sitemap: 'https://frufresco.co/sitemap.xml',
  };
}
