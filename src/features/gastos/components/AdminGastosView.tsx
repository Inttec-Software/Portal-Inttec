import React from 'react';
import { View } from 'react-native';
import { styles } from './adminGastosStyles';
import { useAdminGastos } from '../hooks/useAdminGastos';
import { AdminGastosMainList } from './AdminGastosMainList';
import { AdminGastoReviewModal } from './AdminGastoReviewModal';
import { AdminGastoQuickEditModals } from './AdminGastoQuickEditModals';
import { AdminLinkSaleModal } from './AdminLinkSaleModal';
import { AdminExtraModals } from './AdminExtraModals';

export function AdminGastosView() {
  const vm = useAdminGastos();
  const { themeColors } = vm;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={{ flex: 1 }}>
        <AdminGastosMainList vm={vm} />
        <AdminGastoReviewModal vm={vm} />
        <AdminGastoQuickEditModals vm={vm} />
        <AdminLinkSaleModal vm={vm} />
        <AdminExtraModals vm={vm} />
      </View>
    </View>
  );
}
