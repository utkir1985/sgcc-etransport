import { Paperclip } from 'lucide-react';
import { defectActDocumentPath } from '../utils/documentQrUrl';
import type { YukXatiModel, YukXatiWagonRow } from '../utils/yukXatiModel';

interface YukXatiAnnexViewProps {
  model: YukXatiModel;
  /** Ruxsatnoma / Qo‘riqlash ko‘rinishi — faqat ma’lumot jadvali */
  compact?: boolean;
  /** Modal ichida — sarlavhasiz, faqat jadval */
  embedded?: boolean;
  /** Dalolatnomani shu oynada ochish (sahifaga o‘tmasin) */
  onOpenDefectAct?: (unitId: string) => void;
}

function activeWagons(wagons: YukXatiWagonRow[]): YukXatiWagonRow[] {
  return wagons
    .filter(w => w.wagonNumber != null && String(w.wagonNumber).trim())
    .map((w, i) => ({ ...w, index: i + 1 }));
}

export function YukXatiAnnexView({
  model,
  compact = false,
  embedded = false,
  onOpenDefectAct,
}: YukXatiAnnexViewProps) {
  const rows = activeWagons(model.wagons);
  const pageTare = rows.reduce((s, r) => s + (Number(r.tareKg) || 0), 0);
  const pageBrutto = rows.reduce((s, r) => s + (Number(r.bruttoKg) || 0), 0);
  const pageNetto = rows.reduce((s, r) => s + (Number(r.nettoKg) || 0), 0);
  const seals = rows.filter(r => r.sealNumber).length;
  const ok = rows.filter(r => r.techInspection === 'Soz').length;
  const bad = rows.filter(r => r.techInspection === 'Nosoz' || r.isDefective).length;

  const totalTare = pageTare || model.totalTareKg || 0;
  const totalBrutto = pageBrutto || model.totalBruttoKg || 0;
  const totalNetto = pageNetto || model.totalNettoKg || 0;
  const wagonCount = rows.length || model.wagonCount || 0;
  const sealCount = seals || model.sealCount || 0;

  return (
    <div className={`yx-annex${compact ? ' yx-annex--compact' : ''}${embedded ? ' yx-annex--embedded' : ''}`}>
      {!embedded ? (
        <header className="yx-annex__head">
          <div>
            <p className="yx-annex__kicker">Yuk xati ilovasi</p>
            <h1 className="yx-annex__title">Vagonlar ro‘yxati</h1>
            <p className="yx-annex__meta">
              {model.registryNumber ? `№ ${model.registryNumber}` : ''}
              {model.loadingTaskNo ? ` · ${model.loadingTaskNo}` : ''}
              {model.cargoName ? ` · ${model.cargoName}` : ''}
            </p>
          </div>
          <div className="yx-annex__count-badge">{wagonCount} vagon</div>
        </header>
      ) : null}

      {rows.length === 0 ? (
        <p className="yx-annex__empty">Vagon ma’lumotlari topilmadi.</p>
      ) : (
        <div className="yx-annex__table-wrap">
          <table className="yx-annex__table">
            <thead>
              <tr>
                <th className="yx-annex__idx">T/r</th>
                <th>Vagon raqami</th>
                <th>Vagon turi</th>
                <th>Tegishlilik</th>
                <th>Tara, kg</th>
                <th>Brutto, kg</th>
                <th>Netto, kg</th>
                <th>Plomba №</th>
                <th>Texnik ko‘rik</th>
                <th>Dalolatnoma</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.index}-${r.wagonNumber}`}>
                  <td className="yx-annex__idx">{r.index}</td>
                  <td className="yx-annex__mono">{r.wagonNumber}</td>
                  <td className="yx-annex__left">{r.wagonType}</td>
                  <td>{r.noteOwner}</td>
                  <td className="yx-annex__num">{r.tareKg}</td>
                  <td className="yx-annex__num">{r.bruttoKg}</td>
                  <td className="yx-annex__num">{r.nettoKg}</td>
                  <td>{r.sealNumber}</td>
                  <td className={r.techInspection === 'Nosoz' ? 'yx-annex__defect' : undefined}>{r.techInspection}</td>
                  <td>
                    {r.defectActFileName && r.unitId ? (
                      onOpenDefectAct ? (
                        <button
                          type="button"
                          className="yx-annex__act"
                          onClick={() => onOpenDefectAct(r.unitId!)}
                        >
                          <Paperclip className="h-3.5 w-3.5" strokeWidth={2} />
                          {r.defectActFileName}
                        </button>
                      ) : (
                        <a href={defectActDocumentPath(r.unitId)} className="yx-annex__act">
                          <Paperclip className="h-3.5 w-3.5" strokeWidth={2} />
                          {r.defectActFileName}
                        </a>
                      )
                    ) : (r.isDefective ? 'Yo‘q' : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="yx-annex__total-row">
                <td colSpan={4} className="yx-annex__left">
                  Jami
                </td>
                <td className="yx-annex__num">{totalTare}</td>
                <td className="yx-annex__num">{totalBrutto}</td>
                <td className="yx-annex__num">{totalNetto}</td>
                <td colSpan={3} className="yx-annex__left">
                  {wagonCount} vagon · {sealCount} plomba · soz {ok}
                  {bad > 0 ? ` · nosoz ${bad}` : ''}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
