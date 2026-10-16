import { BadgeCheck } from 'lucide-react';
import { ApprovalQrCode } from './ApprovalQrCode';
import type { YukXatiModel, YukXatiWagonGroup, YukXatiWagonRow } from '../utils/yukXatiModel';
import { formatYukXatiDateTime, groupYukXatiWagons } from '../utils/yukXatiModel';

interface YukXatiViewProps {
  model: YukXatiModel;
}

interface Signer {
  key: string;
  department: string;
  status: string;
  name: string;
  at: string | null;
}

const HEADER_QR_SIZE = 72;

function valueOrDash(value?: string | number | null) {
  return value === undefined || value === null || value === '' ? '—' : value;
}

function formatKg(value: number | string) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? new Intl.NumberFormat('uz-UZ').format(n) : '—';
}

/** Kartochka andozasi: 11.08.2026 15:28:02 */
function formatSignerCardTime(iso?: string | null) {
  if (!iso) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value || '';
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}

/** Lavozim/bo‘lim nomi F.I.Sh. o‘rniga kelib qolgan bo‘lsa — ko‘rsatilmasin */
function personDisplayName(name?: string | null) {
  const value = (name || '').trim();
  if (!value) return '—';
  if (/^(tarozi|ruxsatnoma|qo[‘']riqlash|ichdx|temir yo[‘']l|tayyor mahsulot)/i.test(value)) return '—';
  if (/(operatori|byurosi|xizmati|iqtisodchisi|boshlig|sexi|xodimi)$/i.test(value) && value.split(/\s+/).length <= 4) {
    return '—';
  }
  return value;
}

function signerQrValue(model: YukXatiModel, signer: Signer) {
  const cleanDept = (signer.department || '').replace(/[‘’`]/g, "'");
  const cleanName = (signer.name || 'Tizimda qayd etilmagan').replace(/[‘’`]/g, "'");
  const cleanStatus = (signer.status || 'Tasdiqlash kutilmoqda').replace(/[‘’`]/g, "'");
  const lines = [
    `Hujjat: Yuk xati № ${model.registryNumber}`,
    `Bo'lim/sex: ${cleanDept}`,
    `Holat: ${signer.at ? cleanStatus : 'Tasdiqlash kutilmoqda'}`,
    `F.I.Sh.: ${cleanName}`,
    `Sana/vaqt: ${formatYukXatiDateTime(signer.at) || 'Tasdiqlanmagan'}`,
  ];
  return lines.join('\n');
}

function SignerBlock({ model, signer }: { model: YukXatiModel; signer: Signer }) {
  const approved = Boolean(signer.at) && Boolean(signer.name) && signer.name !== '—' && signer.status !== 'Kutilmoqda';
  const displayName = approved ? personDisplayName(signer.name) : '—';
  return (
    <div className={`yxn-sign${approved ? ' is-approved' : ''}`}>
      <div className="yxn-sign__text">
        <span className="yxn-sign__status" data-status={approved ? signer.status : 'Kutilmoqda'}>
          {approved ? <BadgeCheck strokeWidth={2} aria-hidden /> : null}
          {approved ? signer.status : 'Kutilmoqda'}
        </span>
        <span className="yxn-sign__role">{signer.department}</span>
        <span className="yxn-sign__name">{displayName}</span>
        <time className="yxn-sign__time" dateTime={approved && signer.at ? signer.at : undefined}>
          {approved ? formatSignerCardTime(signer.at) : '—'}
        </time>
      </div>
      <div className="yxn-sign__qr">
        {approved ? (
          <ApprovalQrCode
            value={signerQrValue(model, { ...signer, name: displayName === '—' ? '' : displayName })}
            size={56}
            level="L"
          />
        ) : (
          <span>QR</span>
        )}
      </div>
    </div>
  );
}

/** Jadval elementi: guruh sarlavhasi (WB-…-N · qabul qiluvchi · shartnoma), vagon, guruh jami yoki umumiy jami. */
type TableItem =
  | { kind: 'group'; group: YukXatiWagonGroup; continued?: boolean }
  | { kind: 'wagon'; group: YukXatiWagonGroup; row: YukXatiWagonRow; displayIndex: number }
  | { kind: 'subtotal'; group: YukXatiWagonGroup }
  | { kind: 'grand'; wagonCount: number; tareKg: number; bruttoKg: number; nettoKg: number };

function SumRow({ label, count, tareKg, bruttoKg, nettoKg, className }: {
  label: string; count: number; tareKg: number; bruttoKg: number; nettoKg: number; className: string;
}) {
  return (
    <tr className={className}>
      <td colSpan={2} className="yxn-sum__label">{label}: {count} vagon</td>
      <td>{formatKg(tareKg)}</td>
      <td>{formatKg(bruttoKg)}</td>
      <td>{formatKg(nettoKg)}</td>
      <td colSpan={3} />
    </tr>
  );
}

function WagonRegistryTable({ model, items, continued = false }: {
  model: YukXatiModel;
  items: TableItem[];
  continued?: boolean;
}) {
  return (
    <table className={`yxn-wagons yxn-wagons--grouped${continued ? ' yxn-wagons--continued' : ''}`}>
      <thead>
        <tr>
          <th>T/r</th>
          <th>Vagon raqami</th>
          <th>Vagon og‘irligi<br />(Tara), kg</th>
          <th>Umumiy og‘irlik<br />(Brutto), kg</th>
          <th>Sof og‘irlik<br />(Netto), kg</th>
          <th>Plomba raqami</th>
          <th>Vagon turi</th>
          <th>Mahsulot turi</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => {
          if (item.kind === 'group') {
            const g = item.group;
            return (
              <tr key={`g-${g.number}-${i}`} className={`yxn-group${g.isDefectiveSection ? ' yxn-group--defect' : ''}`}>
                <td colSpan={8}>
                  {!g.isDefectiveSection ? <span className="yxn-group__no">{g.number}</span> : null}
                  <span className="yxn-group__receiver">{g.receiver}</span>
                  {!g.isDefectiveSection && g.contractNumber !== '—'
                    ? <span className="yxn-group__contract"> · Shartnoma № {g.contractNumber}</span>
                    : null}
                  {item.continued ? <span className="yxn-group__contract"> (davomi)</span> : null}
                </td>
              </tr>
            );
          }
          if (item.kind === 'subtotal') {
            const g = item.group;
            return <SumRow key={`s-${g.number}`} label="Jami" count={g.rows.length} tareKg={g.tareKg} bruttoKg={g.bruttoKg} nettoKg={g.nettoKg} className="yxn-subtotal" />;
          }
          if (item.kind === 'grand') {
            return <SumRow key="grand" label="UMUMIY JAMI" count={item.wagonCount} tareKg={item.tareKg} bruttoKg={item.bruttoKg} nettoKg={item.nettoKg} className="yxn-grand" />;
          }
          const row = item.row;
          return (
            <tr key={`w-${row.index}`}>
              <td>{item.displayIndex}</td>
              <td className="yxn-mono">{row.wagonNumber}</td>
              <td>{formatKg(row.tareKg)}</td>
              <td>{formatKg(row.bruttoKg)}</td>
              <td><b>{formatKg(row.nettoKg)}</b></td>
              {row.isDefective
                ? <td className="yxn-defect">{row.defectActFileName || 'Dalolatnoma'}</td>
                : <td className="yxn-mono">{valueOrDash(row.sealNumber)}</td>}
              <td>{row.wagonType}</td>
              <td>{row.productName || model.cargoName || '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function buildTableItems(model: YukXatiModel) {
  const groups = groupYukXatiWagons(model);
  const shipped = groups.filter(g => !g.isDefectiveSection);
  const multiGroup = shipped.length > 1;
  const grand: TableItem = {
    kind: 'grand',
    wagonCount: shipped.reduce((s, g) => s + g.rows.length, 0),
    tareKg: shipped.reduce((s, g) => s + g.tareKg, 0),
    bruttoKg: shipped.reduce((s, g) => s + g.bruttoKg, 0),
    nettoKg: shipped.reduce((s, g) => s + g.nettoKg, 0),
  };
  const items: TableItem[] = [];
  for (const group of groups) {
    if (group.isDefectiveSection && multiGroup) items.push(grand);
    items.push({ kind: 'group', group });
    group.rows.forEach((row, i) => items.push({ kind: 'wagon', group, row, displayIndex: i + 1 }));
    if (multiGroup && !group.isDefectiveSection) items.push({ kind: 'subtotal', group });
  }
  if (multiGroup && !items.some(i => i.kind === 'grand')) items.push(grand);
  return { items, shipped, multiGroup, groupCount: groups.length };
}

/* Sahifalash birliklarda: vagon qatori = 2, ixcham qatorlar (guruh sarlavhasi / jami) = 1 */
const FIRST_PAGE_UNITS = 9;
/** Davom varaqda imzo bloklari uchun joy qoldirish (A4 landscape) */
const CONTINUATION_UNITS = 25;
const CONTINUATION_UNITS_WITH_SIGNATURES = 17;

function paginateYukXatiItems(items: TableItem[], groupCount: number) {
  const units = (i: TableItem) => (i.kind === 'wagon' ? 2 : 1);
  let pos = 0;
  // Bitta guruhli hujjatda (ajratma) raqam sarlavhada bor — keyingi varaqda ustun sarlavhasi yetarli
  const needsContinuedHeader = () => groupCount > 1 && pos > 0 && pos < items.length
    && (items[pos].kind === 'wagon' || items[pos].kind === 'subtotal');
  const remainingUnits = () => items.slice(pos).reduce((s, i) => s + units(i), 0) + (needsContinuedHeader() ? 1 : 0);
  const takeChunk = (cap: number) => {
    const chunk: TableItem[] = [];
    let used = 0;
    if (needsContinuedHeader()) {
      const next = items[pos] as Extract<TableItem, { group: YukXatiWagonGroup }>;
      chunk.push({ kind: 'group', group: next.group, continued: true });
      used = 1;
    }
    while (pos < items.length && used + units(items[pos]) <= cap) {
      used += units(items[pos]);
      chunk.push(items[pos++]);
    }
    // Guruh sarlavhasi sahifa oxirida yolg‘iz qolmasin
    const last = chunk[chunk.length - 1];
    if (pos < items.length && chunk.length > 1 && last?.kind === 'group' && !last.continued) {
      chunk.pop();
      pos--;
    }
    // Guruh/umumiy jami keyingi sahifaga yolg‘iz o‘tmasin — oxirgi vagon u bilan birga ko‘chadi
    if (pos < items.length && (items[pos].kind === 'subtotal' || items[pos].kind === 'grand')) {
      let lastWagon = -1;
      chunk.forEach((it, idx) => { if (it.kind === 'wagon') lastWagon = idx; });
      if (lastWagon > 1 && chunk[lastWagon - 1].kind === 'wagon') {
        pos -= chunk.length - lastWagon;
        chunk.splice(lastWagon);
      }
    }
    return chunk;
  };

  if (remainingUnits() <= FIRST_PAGE_UNITS) {
    return { firstPageItems: items, continuationPages: [] as TableItem[][], signaturesOnFirstPage: true };
  }

  const firstPageItems = takeChunk(FIRST_PAGE_UNITS);
  const continuationPages: TableItem[][] = [];
  while (pos < items.length) {
    const isLastChunk = remainingUnits() <= CONTINUATION_UNITS_WITH_SIGNATURES;
    continuationPages.push(takeChunk(isLastChunk ? CONTINUATION_UNITS_WITH_SIGNATURES : CONTINUATION_UNITS));
  }
  const lastPage = continuationPages[continuationPages.length - 1];
  if (!lastPage || lastPage.reduce((s, i) => s + units(i), 0) > CONTINUATION_UNITS_WITH_SIGNATURES) {
    continuationPages.push([]);
  }

  return { firstPageItems, continuationPages, signaturesOnFirstPage: false };
}

function SignaturesBlock({
  model,
  signers,
  continued = false,
}: {
  model: YukXatiModel;
  signers: Signer[];
  continued?: boolean;
}) {
  return (
    <div className={`yxn-signatures${continued ? ' yxn-signatures--continuation' : ''}`}>
      {signers.map(signer => <SignerBlock key={signer.key} model={model} signer={signer} />)}
    </div>
  );
}

function DocumentFooter({ page, total }: { page: number; total: number }) {
  return (
    <footer className="yxn-footer">
      <span>E-TRANSPORT Axborot tizimi | Yuk xati shakli | “Shurtan gaz kimyo majmuasi” MChJ</span>
      <span>{page}/{total}</span>
    </footer>
  );
}

export function YukXatiView({ model }: YukXatiViewProps) {
  const documentStatus = model.permitOk ? 'Tasdiqlangan' : 'Jarayonda';
  const exitDisplay = model.exitToKengsoyDate && model.exitToKengsoyDate !== '—'
    ? `${model.exitToKengsoyDate} ${model.exitToKengsoyTime || ''}`.trim()
    : '—';
  // Shtamp smena boshlig‘i tasdiqlagandan keyingina (eski hujjatlar — to‘liq kelishilganda)
  const shiftLeaderName = personDisplayName(model.shiftSupervisorName);
  const shiftApproved = shiftLeaderName !== '—' && (Boolean(model.shiftSupervisorAt) || model.permitOk);

  /* 6 ta imzo: Sex, Tarozi, Iqtisodchi, PDS smena boshlig'i, Ruxsatnoma, Qo'riqlash */
  const signers: Signer[] = [
    {
      key: 'warehouse',
      department: 'Tayyor mahsulotlar va xom ashyo sexi',
      status: 'Yuklandi',
      name: (model.warehouseName && model.warehouseName.trim() && model.warehouseName.trim() !== '—') ? model.warehouseName.trim() : '—',
      at: model.warehouseAt || model.formedAt || new Date().toISOString(),
    },
    {
      key: 'scale',
      department: 'Tarozi operatori',
      status: 'Tarozida tortildi',
      name: (model.scaleOperatorName && model.scaleOperatorName.trim() && model.scaleOperatorName.trim() !== '—') ? model.scaleOperatorName.trim() : '—',
      at: model.scaleOperatorAt || model.weighDateTime || model.formedAt || new Date().toISOString(),
    },
    {
      key: 'economist',
      department: 'ICHDX iqtisodchisi',
      status: model.economistAt ? 'Yuk xati shakllantirildi' : 'Kutilmoqda',
      name: model.economistName,
      at: model.economistAt,
    },
    {
      key: 'shift_supervisor',
      department: 'PDS (ICHDX) smena boshlig‘i',
      status: model.shiftSupervisorAt ? 'Tasdiqlandi' : 'Kutilmoqda',
      name: model.shiftSupervisorName,
      at: model.shiftSupervisorAt,
    },
    {
      key: 'permit',
      department: 'Ruxsatnoma byurosi xodimi',
      status: model.permitAt ? 'Kelishildi' : 'Kutilmoqda',
      name: model.permitName,
      at: model.permitAt,
    },
    {
      key: 'security',
      department: 'Qo‘riqlash xizmati (NO‘J) xodimi',
      status: model.securityAt ? 'Kelishildi' : 'Kutilmoqda',
      name: model.securityName,
      at: model.securityAt,
    },
  ];
  const { items, shipped, multiGroup, groupCount } = buildTableItems(model);
  const { firstPageItems, continuationPages, signaturesOnFirstPage } = paginateYukXatiItems(items, groupCount);
  const partQrPending = Boolean(model.part) && !model.qrValue && !model.qrCodeBase64;
  const totalPages = signaturesOnFirstPage ? 1 : 1 + continuationPages.length;

  return (
    <div className="yuk-xati yuk-xati--sample yuk-xati--landscape" data-registry-id={model.registryId}>
      <section className="yxn-page">
        <div className="yxn-topline">
          <strong>E-TRANSPORT Axborot tizimi</strong>
          <span>025-Ф5</span>
        </div>

        <header className="yxn-header">
          <div className="yxn-header__title">
            <h1>YUK XATI</h1>
            <h2>
              BIR YUK XATI BILAN RASMIYLASHTIRILGAN VAGONLAR
              <br />
              REESTRI № {model.registryNumber}
            </h2>
            {model.part ? (
              <div className="yxn-part-badge">
                {model.part.parentRegistryNumber} asosiy yuk xatidan ajratma · {model.part.partNo} / {model.part.partCount}
              </div>
            ) : null}
          </div>
        </header>

        <div className="yxn-head">
          <div className="yxn-head__side yxn-head__side--left">
            <div className={`yxn-head-qr${partQrPending ? ' yxn-head-qr--pending' : ''}`}>
              {partQrPending ? (
                <span title="Ajratma QR kodi QR Link'da ro‘yxatdan o‘tgach chiqadi">QR</span>
              ) : (
                <ApprovalQrCode
                  value={model.qrVerificationUrl || model.qrValue}
                  qrCodeBase64={model.qrCodeBase64}
                  globalId={model.qrGlobalId}
                  size={HEADER_QR_SIZE}
                  level="L"
                  link
                />
              )}
            </div>
            <div className="yxn-head__text yxn-head__text--meta">
              <div><b>Hujjat holati:</b> {documentStatus}</div>
              <div><b>Yuk xati №:</b> {valueOrDash(model.registryNumber)}</div>
              <div><b>Yukni chiqarish sanasi:</b> {exitDisplay}</div>
              {model.part ? (
                <div><b>Asosiy yuk xati:</b> {model.part.parentRegistryNumber}</div>
              ) : multiGroup && model.partsNumbered !== false ? (
                <div><b>Ajratmalar:</b> {shipped.length} ta ({shipped[0].number} … {shipped[shipped.length - 1].number})</div>
              ) : null}
            </div>
          </div>

          <div className={`yxn-head__side yxn-head__side--right${shiftApproved ? ' is-approved' : ''}`}>
            <div className="yxn-head__text yxn-head__text--right yxn-head__text--meta yxn-head__text--signer">
              <div className="font-bold">Bosh direktor</div>
              <div className="yxn-head__name font-bold">Sh. Aslanov</div>
              <div className="yxn-head__stamp-status font-bold">
                {shiftApproved ? 'TASDIQLANDI' : 'KUTILMOQDA'}
              </div>
            </div>
            <div className="yxn-head__stamp">
              <div className="yxn-head-qr">
                {shiftApproved ? (
                  <ApprovalQrCode
                    value={[
                      // Bosh direktor nomidan ishonchnoma asosida — ICHDX smena boshlig‘i (havolasiz)
                      'Holat: Tasdiqlandi',
                      'Bo\'lim/sex: ICHDX smena boshlig\'i',
                      `F.I.Sh.: ${shiftLeaderName}`,
                      'Ishonchnoma raqami: 01-5/25-33 12.08.2026',
                      `Sana/vaqt: ${formatYukXatiDateTime(model.shiftSupervisorAt || model.railwayRepAt || model.formedAt) || 'Tasdiqlanmagan'}`,
                    ].join('\n')}
                    size={HEADER_QR_SIZE}
                    level="M"
                  />
                ) : (
                  <span>QR</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <table className="yxn-shipment yxn-shipment--new-sample">
          <colgroup>
            <col style={{ width: '16%' }} />
            <col style={{ width: '21%' }} />
            <col style={{ width: '21%' }} />
            <col style={{ width: '21%' }} />
            <col style={{ width: '21%' }} />
          </colgroup>
          <tbody>
            <tr><td colSpan={5}><span>Jo‘natuvchi tashkilot</span><b>{model.consignorName}</b></td></tr>
            <tr><td colSpan={5}><span>Yuk jo‘natuvchi stansiya</span><b>732602 - KENGSOY</b></td></tr>
            <tr><td colSpan={5}><span>Yuklash joyi / jo‘natuvchi manzili</span><b className="yxn-shipment__address">{model.consignorAddress}</b></td></tr>
            <tr className="yxn-shipment__flags">
              <td colSpan={2}>Transport turi: <b>☑ Temir yo‘l</b> ☐ Avtomobil</td>
              <td colSpan={3}>Jo‘natishga moliyaviy ruxsat: <b>{model.permitOk ? '☑ Berildi' : '☐ Berildi'}</b> {model.permitDenied ? '☑ Berilmadi' : '☐ Berilmadi'}</td>
            </tr>
            <tr>
              <th rowSpan={2}>Vagonlar<br />soni</th>
              <th colSpan={3}>Jami yuk massasi, kg</th>
              <th rowSpan={2}>Yuklash usuli</th>
            </tr>
            <tr>
              <th>Vagon og‘irligi<br />(Tara)</th>
              <th>Umumiy og‘irlik<br />(Brutto)</th>
              <th>Sof og‘irlik<br />(Netto)</th>
            </tr>
            <tr>
              <td><b>{model.wagonCount}</b></td>
              <td><b>{formatKg(model.totalTareKg)}</b></td>
              <td><b>{formatKg(model.totalBruttoKg)}</b></td>
              <td><b>{formatKg(model.totalNettoKg)}</b></td>
              <td><b>Nasos orqali quyish</b></td>
            </tr>
          </tbody>
        </table>

        <WagonRegistryTable model={model} items={firstPageItems} />
        {signaturesOnFirstPage ? (
          <SignaturesBlock model={model} signers={signers} />
        ) : null}
        <DocumentFooter page={1} total={totalPages} />
      </section>

      {continuationPages.map((pageItems, pageIndex) => {
        const pageNumber = pageIndex + 2;
        const isLastPage = pageIndex === continuationPages.length - 1;
        const showSignatures = isLastPage && !signaturesOnFirstPage;
        return (
          <section className="yxn-page yxn-page--continuation" key={pageNumber}>
            <div className="yxn-topline">
              <strong>E-TRANSPORT Axborot tizimi</strong>
              <span>025-Ф5</span>
            </div>

            {pageItems.length ? <WagonRegistryTable model={model} items={pageItems} continued /> : null}

            {showSignatures ? (
              <SignaturesBlock model={model} signers={signers} continued />
            ) : null}

            <DocumentFooter page={pageNumber} total={totalPages} />
          </section>
        );
      })}
    </div>
  );
}
