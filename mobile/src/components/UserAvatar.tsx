import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, StyleSheet, Text, View } from 'react-native';
import { getAvatarColor, getInitials, getPresetAvatar } from '../social/avatars';
import { font, radius, useTheme } from '../theme';
import { Tappable } from './Tappable';
import { thud } from '../platform/haptics';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl' | number;

const SIZES: Record<'sm' | 'md' | 'lg' | 'xl', { box: number; font: number; icon: number }> = {
  sm: { box: 34, font: 12, icon: 18 },
  md: { box: 44, font: 15, icon: 22 },
  lg: { box: 72, font: 24, icon: 36 },
  xl: { box: 96, font: 32, icon: 48 },
};

export interface UserAvatarProps {
  avatarUrl?: string | null;
  name?: string;
  username?: string;
  size?: AvatarSize;
  editable?: boolean;
  onPress?: () => void;
  ring?: boolean;
}

export const UserAvatar = ({
  avatarUrl,
  name,
  username,
  size = 'md',
  editable = false,
  onPress,
  ring = false,
}: UserAvatarProps) => {
  const { colors } = useTheme();

  const dimensions =
    typeof size === 'number'
      ? { box: size, font: Math.round(size * 0.35), icon: Math.round(size * 0.5) }
      : SIZES[size] ?? SIZES.md;

  const boxSize = dimensions.box;
  const borderRadius = boxSize / 2;
  const preset = getPresetAvatar(avatarUrl);
  const isImage = Boolean(avatarUrl && (avatarUrl.startsWith('data:') || avatarUrl.startsWith('http')));

  const content = (
    <View
      style={[
        styles.container,
        {
          width: boxSize,
          height: boxSize,
          borderRadius,
        },
        ring && {
          borderWidth: 2,
          borderColor: colors.accent,
        },
      ]}
    >
      {isImage ? (
        <Image
          source={{ uri: avatarUrl! }}
          style={{ width: boxSize, height: boxSize, borderRadius }}
          resizeMode="cover"
        />
      ) : preset ? (
        <View
          style={[
            styles.centered,
            {
              width: boxSize,
              height: boxSize,
              borderRadius,
              backgroundColor: preset.bg,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: preset.color + '55',
            },
          ]}
        >
          <Ionicons name={preset.icon} size={dimensions.icon} color={preset.color} />
        </View>
      ) : (
        <View
          style={[
            styles.centered,
            {
              width: boxSize,
              height: boxSize,
              borderRadius,
              backgroundColor: getAvatarColor(username || name),
            },
          ]}
        >
          <Text
            style={[
              styles.initials,
              {
                fontSize: dimensions.font,
                color: '#ffffff',
              },
            ]}
          >
            {getInitials(name || username)}
          </Text>
        </View>
      )}

      {editable && (
        <View
          style={[
            styles.editBadge,
            {
              backgroundColor: colors.accent,
              borderColor: colors.surface,
              width: Math.max(22, Math.round(boxSize * 0.3)),
              height: Math.max(22, Math.round(boxSize * 0.3)),
              borderRadius: radius.pill,
            },
          ]}
        >
          <Ionicons name="camera" size={Math.max(11, Math.round(boxSize * 0.16))} color={colors.onFill} />
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Tappable
        onPress={() => {
          thud('light');
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Avatar for ${name || username || 'user'}`}
        scaleTo={0.94}
      >
        {content}
      </Tappable>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'visible',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: font.uiStrong,
    letterSpacing: 0.5,
  },
  editBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,
  },
});
