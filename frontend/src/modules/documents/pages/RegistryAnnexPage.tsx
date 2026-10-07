import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { YukXatiAnnexView } from '../../../shared/components/YukXatiAnnexView';
import { DefectActView } from '../../../shared/components/DefectActView';
import { api } from '../../../shared/services/api';
import type { EmptyWagonArrival, EmptyWagonUnit, LoadingRegistry } from '../../../shared/types';
import { buildYukXatiModel, type YukXatiModel } from '../../../shared/utils/yukXatiModel';
import { buildDefectActModel } from '../../../shared/utils/defectActModel';
import { resolveDefectActType, type DefectActType } from '../../../shared/constants/defectActTypes';

/** Ruxsatnoma byurosi / Qo‘riqlash — faqat vagonlar ilovasi (alohida oyna). */
export default function RegistryAnnexPage() {
  const [params] = useSearchParams();
  const registryId = params.get('yx')?.trim() ?? '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [model, setModel] = useState<YukXatiModel | null>(null);
  const [arrivals, setArrivals] = useState<EmptyWagonArrival[]>([]);
  const [defect, setDefect] = useState<{ arrival: EmptyWagonArrival; unit: EmptyWagonUnit } | null>(null);

  useEffect(() => {
    if (!registryId) {
      setError('Reyestr tanlanmagan');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    setModel(null);

    Promise.all([
      api.getLoadingRegistries(),
      api.getEmptyWagonArrivals(),
      api.getGateWeighingQueue().catch(() => ({ data: null })),
    ])
      .then(([regRes, arrRes, queueRes]) => {
        if (cancelled) return;
        const registries = (regRes.data ?? []) as LoadingRegistry[];
        const registry = registries.find(r => r.id.toLowerCase() === registryId.toLowerCase());
        if (!registry) {
          setError('Yuk xati reyestri topilmadi');
          return;
        }
        const list = (arrRes.data ?? []) as EmptyWagonArrival[];
        const queueArrivals = ((queueRes?.data as { emptyWagonsQueue?: EmptyWagonArrival[] })?.emptyWagonsQueue ?? []);
        const arrivalsMap = new Map<string, EmptyWagonArrival>();
        for (const arr of list) arrivalsMap.set(arr.id.toLowerCase(), arr);
        for (const arr of queueArrivals) {
          if (!arrivalsMap.has(arr.id.toLowerCase())) arrivalsMap.set(arr.id.toLowerCase(), arr);
        }
        const allArrivals = Array.from(arrivalsMap.values());
        setArrivals(allArrivals);
        const arrival = registry.emptyWagonArrivalId
          ? (allArrivals.find(a => a.id.toLowerCase() === registry.emptyWagonArrivalId.toLowerCase()) ?? null)
          : null;
        setModel(buildYukXatiModel(registry, arrival, null, null, allArrivals.flatMap(a => a.wagons ?? [])));
      })
      .catch(() => {
        if (!cancelled) setError('Ma’lumotlarni yuklash amalga oshmadi');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [registryId]);

  useEffect(() => {
    document.title = model?.registryNumber
      ? `Ilova — ${model.registryNumber}`
      : 'Yuk xati ilovasi';
  }, [model]);

  const openDefectAct = (unitId: string) => {
    for (const arrival of arrivals) {
      const unit = (arrival.wagons ?? []).find(item => item.id === unitId);
      if (unit) {
        setDefect({ arrival, unit });
        return;
      }
    }
  };

  if (loading) {
    return <div className="yx-annex-page yx-annex-page--loading">Yuklanmoqda...</div>;
  }

  if (error || !model) {
    return (
      <div className="yx-annex-page yx-annex-page--error">
        <p>{error || 'Ma’lumot topilmadi'}</p>
      </div>
    );
  }

  return (
    <div className="yx-annex-page">
      <YukXatiAnnexView model={model} compact onOpenDefectAct={openDefectAct} />
      {defect ? (
        <DefectActView
          model={buildDefectActModel(defect.arrival, defect.unit)}
          actType={resolveDefectActType(
            defect.unit.wagonType,
            defect.unit.loadingComment,
            defect.unit.defectActType as DefectActType | undefined,
          )}
          onClose={() => setDefect(null)}
        />
      ) : null}
    </div>
  );
}
