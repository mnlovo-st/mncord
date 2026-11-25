/// <reference types="vite/client" />
import type { MncordApi } from '../preload/index';

declare global {
  interface Window {
    mncord: MncordApi;
  }
}
export {};
