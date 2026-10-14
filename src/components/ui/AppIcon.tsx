import { Icon } from 'react-native-paper';

import { colors, sizes } from '@/theme';
import type { ColorToken } from '@/theme';

type Props = {
  name: string;
  size?: number;
  color?: ColorToken;
};

export function AppIcon({ name, size = sizes.icon, color = 'text' }: Props) {
  return <Icon source={name} size={size} color={colors[color]} />;
}
