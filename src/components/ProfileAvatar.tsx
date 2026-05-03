import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';

interface Props {
  avatarUrl: string | null | undefined;
  displayName: string | null | undefined;
  /** Team primary_color hex strings — drives the conic gradient ring */
  teamColors?: string[];
  size?: number;
}

/**
 * Builds a CSS-style conic-gradient string from an array of team colors.
 * Colors are evenly distributed and each bleeds into the next with a soft
 * midpoint transition so there are no hard stops.
 */
function buildConicGradient(colors: string[]): string {
  if (colors.length === 0) return 'transparent';
  if (colors.length === 1) return colors[0];

  const stops: string[] = [];
  const total = colors.length;

  colors.forEach((color, i) => {
    const startDeg = (i / total) * 360;
    const endDeg = ((i + 1) / total) * 360;
    const midDeg = (startDeg + endDeg) / 2;
    const nextColor = colors[(i + 1) % total];

    // Each team color holds its solid center, then blends into the next
    stops.push(`${color} ${startDeg.toFixed(1)}deg`);
    stops.push(`${color} ${midDeg.toFixed(1)}deg`);
    stops.push(`${nextColor} ${endDeg.toFixed(1)}deg`);
  });

  return `conic-gradient(from 0deg, ${stops.join(', ')})`;
}

export function ProfileAvatar({ avatarUrl, displayName, teamColors = [], size = 80 }: Props) {
  const ringSize = size + 12;
  const ringPad = 4;
  const innerSize = ringSize - ringPad * 2;

  const initial = (displayName || 'G')
    .trim()
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const hasRing = teamColors.length > 0;

  // Build inline style for the ring — React Native doesn't support
  // conic-gradient natively so we simulate it with a series of LinearGradient
  // segments. For the HTML mockup this drives the visual; in RN we use
  // the CanvasKit / svg approach in the screen itself.
  // This component exposes the color list so the screen can render the ring
  // using expo-linear-gradient segments.

  return (
    <View style={{ width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center' }}>
      {/* Ring is rendered by the parent via teamColors — this just provides the inner circle */}
      <View style={{
        width: innerSize,
        height: innerSize,
        borderRadius: innerSize / 2,
        backgroundColor: '#1e1e1e',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: innerSize, height: innerSize }}
            contentFit="cover"
            accessible={false}
          />
        ) : (
          <Text style={{
            color: '#fff',
            fontSize: size * 0.35,
            fontWeight: '800',
            letterSpacing: -0.5,
          }}>
            {initial}
          </Text>
        )}
      </View>
    </View>
  );
}

export { buildConicGradient };
