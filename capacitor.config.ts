import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'eu.carbonstealth.opalchentsi',
  appName: 'Опълченците 1877',
  webDir: 'dist',
  android: {
    // Заключваме ориентацията към портрет от конфигурацията на проекта.
    // Финалното заключване се прави и в AndroidManifest.xml.
    backgroundColor: '#0d0a07',
  },
  backgroundColor: '#0d0a07',
};

export default config;
