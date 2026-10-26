import React from 'react';
import {
  GastosTableSkeleton,
  GastosCardsListSkeleton,
  GastosTableSkeletonProps,
  GastosCardsListSkeletonProps,
} from './GastosSkeleton';

export interface EmpleadosTableSkeletonProps extends GastosTableSkeletonProps {}
export interface EmpleadosCardsListSkeletonProps extends GastosCardsListSkeletonProps {}

export const EmpleadosTableSkeleton: React.FC<EmpleadosTableSkeletonProps> = (props) => {
  return <GastosTableSkeleton {...props} />;
};

export const EmpleadosCardsListSkeleton: React.FC<EmpleadosCardsListSkeletonProps> = (props) => {
  return <GastosCardsListSkeleton {...props} />;
};
