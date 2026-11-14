import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const DM_SANS_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&display=swap';
const WORK_SANS_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Work+Sans:ital,wght@0,400..700;1,400..700&display=swap';
const CABINET_GROTESK_STYLESHEET =
  'https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@400,500,600,700&display=swap';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href={DM_SANS_STYLESHEET} />
        <link rel="stylesheet" href={WORK_SANS_STYLESHEET} />
        <link rel="stylesheet" href={CABINET_GROTESK_STYLESHEET} />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
