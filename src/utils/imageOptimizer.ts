import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';

export const optimizeImage = async (uri: string): Promise<{ uri: string; base64?: string }> => {
  if (Platform.OS === 'web') {
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1000 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      return { uri: result.uri, base64: result.base64 };
    } catch (e) {
      console.warn("Could not optimize image on web, returning original", e);
      return { uri };
    }
  }

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1000 } }],
    { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  return { uri: result.uri, base64: result.base64 };
};
