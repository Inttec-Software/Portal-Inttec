import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import GastoFormView from '@/features/gastos/components/GastoFormView';

export default function EditarGastoForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GastoFormView role="admin" mode="edit" gastoId={id} />;
}
