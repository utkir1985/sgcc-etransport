import { splitStations } from '../utils/stations';

/** Buyurtma qatoridagi stansiyalar — har biri alohida qatorda (ustma-ust), ikonkasiz. */
export function StationStack({ value }: { value?: string | null }) {
  const stations = splitStations(value);
  if (stations.length === 0) return <span>—</span>;
  return (
    <span className="order-sheet-station-stack">
      {stations.map(name => <span key={name}>{name}</span>)}
    </span>
  );
}
