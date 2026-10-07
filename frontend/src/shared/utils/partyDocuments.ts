import type { EmptyWagonArrival, EmptyWagonUnit, LoadingRegistry } from '../types';
import { hasDefectAct } from '../constants/defectActTypes';

export type PartyDocumentKind = 'yuk-xati' | 'yuk-ilova' | 'kiritish' | 'dalolatnoma';

export type PartyDocument = {
  key: string;
  kind: PartyDocumentKind;
  label: string;
  meta?: string;
  unitId?: string;
  arrivalId?: string;
  registryId?: string;
};

export function hasEntryPermitQr(arrival?: EmptyWagonArrival | null): boolean {
  return Boolean(arrival?.entryPermitNumber?.trim() || arrival?.entryPermitShiftApprovedAt);
}

export function issuedDefectUnits(arrival?: EmptyWagonArrival | null): EmptyWagonUnit[] {
  return (arrival?.wagons ?? []).filter(unit => hasDefectAct(unit));
}

export function collectPartyDocuments(opts: {
  registry?: LoadingRegistry | null;
  registries?: LoadingRegistry[] | null;
  arrival?: EmptyWagonArrival | null;
}): PartyDocument[] {
  const { arrival } = opts;
  const registries = [
    ...(opts.registries ?? []),
    ...(opts.registry ? [opts.registry] : []),
  ].filter((item, index, list) => list.findIndex(other => other.id === item.id) === index);
  const docs: PartyDocument[] = [];

  for (const registry of registries) {
    docs.push({
      key: `yx-${registry.id}`,
      kind: 'yuk-xati',
      label: 'Yuk xati',
      meta: registry.registryNumber,
      registryId: registry.id,
      arrivalId: registry.emptyWagonArrivalId,
    });
    docs.push({
      key: `yx-ilova-${registry.id}`,
      kind: 'yuk-ilova',
      label: 'Yuk xati ilovasi',
      meta: `${registry.wagonCount || 0} vagon`,
      registryId: registry.id,
      arrivalId: registry.emptyWagonArrivalId,
    });
  }

  if (arrival && hasEntryPermitQr(arrival)) {
    docs.push({
      key: `ep-${arrival.id}`,
      kind: 'kiritish',
      label: 'Kiritish xizmat xati',
      meta: arrival.entryPermitNumber || arrival.arrivalNumber,
      arrivalId: arrival.id,
    });
  }

  if (arrival) {
    for (const unit of issuedDefectUnits(arrival)) {
      docs.push({
        key: `da-${unit.id}`,
        kind: 'dalolatnoma',
        label: 'Dalolatnoma',
        meta: [unit.defectActNumber, unit.wagonNumber].filter(Boolean).join(' · ') || unit.wagonNumber,
        unitId: unit.id,
        arrivalId: arrival.id,
      });
    }
  }

  return docs;
}
