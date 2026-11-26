import React from 'react';
import { DirectorioClientesView } from '@/features/directorio-clientes/DirectorioClientesView';

export default function EmpleadoDirectorioClientesScreen() {
  return <DirectorioClientesView canEdit={false} />;
}
