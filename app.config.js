module.exports = {
  expo: {
    name: "Weather Forest",
    slug: "weather-forest",
    version: "1.0.0",
    orientation: "portrait",
    // icon: "./assets/icon.png", // Commented out - create assets folder and add icon.png if needed
    userInterfaceStyle: "light",
    splash: {
      // image: "./assets/splash.png", // Commented out - create assets folder and add splash.png if needed
      resizeMode: "contain",
      backgroundColor: "#007AFF"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.weatherforest.app",
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "We need your location to provide accurate weather forecasts"
      }
    },
    android: {
      // adaptiveIcon: {
      //   foregroundImage: "./assets/adaptive-icon.png", // Commented out - create assets folder and add adaptive-icon.png if needed
      //   backgroundColor: "#007AFF"
      // },
      package: "com.weatherforest.app",
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION"
      ],
      useNextNotificationsApi: true
    },
    plugins: [
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "We need your location to provide accurate weather forecasts."
        }
      ],
      [
        "expo-notifications",
        {
          color: "#007AFF",
          sounds: []
        }
      ]
    ]
  }
};



