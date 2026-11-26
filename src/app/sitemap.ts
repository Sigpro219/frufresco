import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://frufresco.co';
  const lastModified = new Date();
  return [
    { url: baseUrl, lastModified, changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/b2b/register`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/pqrs`, lastModified, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/privacidad`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${baseUrl}/terminos`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
  ];
}
