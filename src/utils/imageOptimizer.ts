import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';

export const optimizeImage = async (uri: string): Promise<{ uri: string; base64?: string }> => {
  if (Platform.OS === 'web') {
    let finalUri = uri;
    let finalBase64 = '';
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1000 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      finalUri = result.uri;
      finalBase64 = result.base64 || '';
    } catch (e) {
      console.warn("Could not optimize image on web, returning original", e);
    }
    
    // If we still don't have base64 (either manipulateAsync failed or didn't return it), fetch it manually
    if (!finalBase64 && finalUri.startsWith('blob:')) {
      try {
        const response = await fetch(finalUri);
        const blob = await response.blob();
        finalBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
             const res = reader.result as string;
             resolve(res.split(',')[1] || res);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (err) {
        console.warn("Could not fetch blob for base64 fallback", err);
      }
    }
    return { uri: finalUri, base64: finalBase64 };
  }

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1000 } }],
    { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  return { uri: result.uri, base64: result.base64 };
};
