import { metadata as existingMetadata } from '../../../app/layout';

export { default, viewport } from '../../../app/layout';
export const metadata = {
  ...existingMetadata,
  metadataBase: new URL(process.env.WEB_ORIGIN ?? 'https://dongchaythoigian.phungthienphu.workers.dev'),
};
