import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

export type IoniconsName = ComponentProps<typeof Ionicons>['name'];

export interface PresetAvatar {
  id: string; // e.g. 'preset:fire'
  label: string;
  icon: IoniconsName;
  bg: string;
  color: string;
}

export const PRESET_AVATARS: PresetAvatar[] = [
  { id: 'preset:fire', label: 'Beast Fire', icon: 'flame', bg: '#371B1B', color: '#EF4444' },
  { id: 'preset:barbell', label: 'Iron Barbell', icon: 'barbell', bg: '#172554', color: '#3B82F6' },
  { id: 'preset:dumbbell', label: 'Hypertrophy', icon: 'barbell-outline', bg: '#052E16', color: '#10B981' },
  { id: 'preset:lightning', label: 'Explosive Power', icon: 'flash', bg: '#2E1065', color: '#A855F7' },
  { id: 'preset:trophy', label: 'Champion', icon: 'trophy', bg: '#451A03', color: '#F59E0B' },
  { id: 'preset:shield', label: 'Iron Shield', icon: 'shield-checkmark', bg: '#083344', color: '#06B6D4' },
  { id: 'preset:crown', label: 'Monarch', icon: 'ribbon', bg: '#431407', color: '#F97316' },
  { id: 'preset:skull', label: 'Heavy Metal', icon: 'skull', bg: '#1F2937', color: '#9CA3AF' },
  { id: 'preset:runner', label: 'Hybrid Athlete', icon: 'walk', bg: '#500724', color: '#EC4899' },
  { id: 'preset:heart', label: 'Longevity', icon: 'heart', bg: '#4C0519', color: '#F43F5E' },
];

export const getPresetAvatar = (id?: string | null): PresetAvatar | null => {
  if (!id || !id.startsWith('preset:')) return null;
  return PRESET_AVATARS.find((p) => p.id === id) ?? null;
};

export const AVATAR_PALETTE = [
  '#E57373',
  '#81C784',
  '#64B5F6',
  '#FFB74D',
  '#BA68C8',
  '#4DB6AC',
  '#F06292',
  '#FF8A65',
];

export const getAvatarColor = (seed?: string): string => {
  if (!seed) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};

export const getInitials = (name?: string): string => {
  if (!name) return '🏋️';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

/**
 * Asks for a photo from the library or the camera, uncropped.
 *
 * The picker's own crop step (`allowsEditing`) does nothing on the web, where
 * most people use the app, and the photo went straight to a 256 x 256 resize
 * that set both sides, so a portrait came out squashed and nobody could choose
 * which part of it showed. The square is chosen in the app instead
 * (AvatarCropper), the same on every platform.
 */
export const pickAvatarSource = async (
  useCamera = false,
): Promise<{ uri: string; width: number; height: number } | null> => {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 1 };
  const result = useCamera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset?.uri || !asset.width || !asset.height) return null;
  return { uri: asset.uri, width: asset.width, height: asset.height };
};

/** Cuts the chosen square out and makes it a small 256 x 256 JPEG data URL. */
export const cropAvatar = async (
  uri: string,
  crop: { originX: number; originY: number; width: number; height: number },
): Promise<string> => {
  const manipResult = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop }, { resize: { width: 256, height: 256 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return manipResult.base64 ? `data:image/jpeg;base64,${manipResult.base64}` : manipResult.uri;
};

export const TRAINING_FOCUS_OPTIONS = [
  { value: 'Hypertrophy', label: 'Hypertrophy (Muscle Gain)' },
  { value: 'Strength & Powerlifting', label: 'Powerlifting / Heavy Strength' },
  { value: 'Hybrid Athlete', label: 'Hybrid (Lifting & Cardio)' },
  { value: 'Fat Loss & Cutting', label: 'Cutting / Fat Loss' },
  { value: 'Endurance & Running', label: 'Endurance & Functional' },
  { value: 'General Health', label: 'General Health & Fitness' },
] as const;
