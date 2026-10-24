import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BRAND, BRAND_WORDMARK } from '../brand';

export const BrandLockup = ({
  markColor,
  textColor,
  size,
  style,
}: {
  markColor: string;
  textColor: string;
  size: number;
  style?: StyleProp<ViewStyle>;
}) => (
  <View
    style={style}
    accessible
    accessibilityLabel={BRAND.name}
  >
    <Svg
      width={size * 0.72 * BRAND_WORDMARK.width / (BRAND_WORDMARK.height - BRAND_WORDMARK.capTop)}
      height={size * 0.72 * BRAND_WORDMARK.height / (BRAND_WORDMARK.height - BRAND_WORDMARK.capTop)}
      viewBox={`0 0 ${BRAND_WORDMARK.width} ${BRAND_WORDMARK.height}`}
      accessible={false}
    >
      {BRAND_WORDMARK.shapes.map((shape, index) => (
        <Path key={index} d={shape.d} transform={`translate(${shape.x} ${shape.y})`}
          fill={shape.role === 'accent' ? markColor : textColor} fillRule="evenodd" />
      ))}
    </Svg>
  </View>
);
