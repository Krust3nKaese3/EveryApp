import { ErrorUtils } from 'react-native';

type ErrorCallback = (error: Error, isFatal: boolean) => void;

let errorCallback: ErrorCallback | null = null;

export const setupGlobalErrorHandler = (callback: ErrorCallback) => {
  errorCallback = callback;

  const defaultHandler = ErrorUtils.getGlobalHandler();

  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error('Global error handler:', error, 'isFatal:', isFatal);
    
    if (errorCallback) {
      errorCallback(error, isFatal ?? false);
    }

    if (defaultHandler) {
      defaultHandler(error, isFatal);
    }
  });

  if (typeof Promise !== 'undefined') {
    const globalObj = typeof window !== 'undefined' ? window : (globalThis as any);
    if (globalObj) {
      globalObj.onunhandledrejection = (event: any) => {
        console.error('Unhandled promise rejection:', event.reason);
        if (errorCallback && event.reason instanceof Error) {
          errorCallback(event.reason, false);
        }
      };
    }
  }
};

export const removeGlobalErrorHandler = () => {
  errorCallback = null;
  const globalObj = typeof window !== 'undefined' ? window : (globalThis as any);
  if (globalObj) {
    globalObj.onunhandledrejection = null;
  }
};
