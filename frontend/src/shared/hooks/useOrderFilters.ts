import { useEffect, useRef, useState } from 'react';
import type { MonthlyOrder } from '../types';
import { matchesPeriodRange } from '../utils/dates';

export function matchesOrderFilter(
  order: MonthlyOrder,
  periodFrom: string,
  periodTo: string,
  filterProductType: string,
): boolean {
  if (!filterProductType) return false;
  if (!matchesPeriodRange(order.year, order.month, periodFrom, periodTo)) return false;
  return order.productType === filterProductType;
}

export function useOrderFilters() {
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [filterProductType, setFilterProductType] = useState('');
  const [productOpen, setProductOpen] = useState(false);
  const productRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (productRef.current && !productRef.current.contains(target)) {
        setProductOpen(false);
      }
    }

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    setProductOpen(false);
  }, [filterProductType]);

  const matches = (order: MonthlyOrder) =>
    matchesOrderFilter(order, periodFrom, periodTo, filterProductType);

  return {
    periodFrom,
    periodTo,
    setPeriodFrom,
    setPeriodTo,
    filterProductType,
    setFilterProductType,
    productOpen,
    setProductOpen,
    productRef,
    matches,
  };
}

export type OrderFilters = ReturnType<typeof useOrderFilters>;
