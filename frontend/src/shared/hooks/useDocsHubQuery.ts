import { useEffect, useState } from 'react';
import {
  docsPeriodRange,
  type DocsPeriodPreset,
} from '../utils/docsHubFilter';

export function useDocsHubQuery(defaultPreset: Exclude<DocsPeriodPreset, 'custom'> = 'all') {
  const initial = docsPeriodRange(defaultPreset);
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<DocsPeriodPreset>(defaultPreset);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [product, setProduct] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const pickPreset = (next: Exclude<DocsPeriodPreset, 'custom'>) => {
    setPreset(next);
    const range = docsPeriodRange(next);
    setFrom(range.from);
    setTo(range.to);
    setPage(1);
  };

  const onFromChange = (value: string) => {
    setFrom(value);
    setPreset('custom');
    setPage(1);
  };

  const onToChange = (value: string) => {
    setTo(value);
    setPreset('custom');
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [search, product, pageSize, from, to]);

  return {
    search,
    setSearch,
    preset,
    from,
    to,
    product,
    setProduct,
    page,
    setPage,
    pageSize,
    setPageSize,
    pickPreset,
    onFromChange,
    onToChange,
  };
}
