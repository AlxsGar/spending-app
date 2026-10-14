import type { ReactNode } from 'react';

import { AddFab } from '@/components/add-fab';
import { Screen } from '@/components/ui';

export function TabScreen({ children }: { children: ReactNode }) {
  return <Screen overlay={<AddFab />}>{children}</Screen>;
}
