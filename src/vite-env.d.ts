/// <reference types="vite/client" />

import type { VitalsApi } from './shared/types';

declare global {
  interface Window {
    vitals: VitalsApi;
  }
}
