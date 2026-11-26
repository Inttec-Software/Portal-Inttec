import React from 'react';
import { DirectorioClientesView } from '@/features/directorio-clientes/DirectorioClientesView';

export default function AdminDirectorioClientesScreen() {
  return <DirectorioClientesView canEdit={true} />;
}
