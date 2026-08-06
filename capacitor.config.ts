import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.nicvandewetering.tiptapgames",
  appName: "Tip Tap Games",
  webDir: "out",
  ios: {
    scheme: "App",
    contentInset: "never",
    scrollEnabled: false,
    backgroundColor: "#0b0f16",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2500,
      backgroundColor: "#0b0f16",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
    },
  },
};

export default config;
