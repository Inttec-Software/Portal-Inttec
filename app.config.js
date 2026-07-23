module.exports = {
  expo: {
    name: "Portal Inttec & Daravisa",
    slug: "portal-inttec",
    version: "1.2.3",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "appmovil",
    userInterfaceStyle: "automatic",
    ios: {
      icon: "./assets/expo.icon",
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || ""
      }
    },
    android: {
      versionCode: 15,
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png"
      },
      predictiveBackGestureEnabled: false,
      package: "com.alexisef23.appmovil",
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || ""
        }
      }
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      "expo-font",
      "expo-image",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#208AEF",
          android: {
            image: "./assets/images/splash-icon.png",
            imageWidth: 76
          }
        }
      ],
      "expo-secure-store",
      "expo-sharing",
      "@react-native-community/datetimepicker",
      [
        "expo-image-picker",
        {
          photosPermission: "Permite que esta aplicación acceda a tu galería de fotos para subir evidencias de gastos y trabajos.",
          cameraPermission: "Permite que esta aplicación acceda a tu cámara para capturar fotos de tickets y evidencias de trabajo."
        }
      ],
      [
        "expo-camera",
        {
          cameraPermission: "Permite que esta aplicación acceda a tu cámara para registrar tu asistencia con una selfie."
        }
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "Permite que esta aplicación acceda a tu ubicación para verificar el lugar de registro de asistencia.",
          locationWhenInUsePermission: "Permite que esta aplicación acceda a tu ubicación para verificar el lugar de registro de asistencia."
        }
      ]
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },
    extra: {
      router: {},
      eas: {
        projectId: "b2643e41-e676-497d-ab34-27eedbbf9ae1"
      }
    }
  }
};
